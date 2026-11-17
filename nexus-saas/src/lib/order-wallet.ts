import { assertWalletPurchase } from "@/lib/credit-account"
import { getWalletBalance, moneyToMinor } from "@/lib/money"
import { db } from "@/lib/db"
import type { Prisma } from "@prisma/client"
import { lockWallet } from "@/lib/wallet-lock"

type DebitMeta = { walletTransactionId: string; amount: number; userId: string }
type ProfitReversalMeta = { reversedAmount: number; reason: string }
type RefundParams = { orderId: string; organizationId?: string | null; reason: string }
function parseMeta(meta: string | null): any {
  try { return meta ? JSON.parse(meta) : null } catch { return null }
}
async function lockOrder(tx: Prisma.TransactionClient, orderId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`
}
export async function createOrderWalletDebit(params: {
  orderId: string; organizationId: string; userId: string; amount: number; performedByRole?: string | null
}) {
  if (!Number.isFinite(params.amount) || params.amount <= 0) throw new Error("INVALID_DEBIT_AMOUNT")
  return db.$transaction(tx => createOrderWalletDebitInTransaction(tx, params), { maxWait: 10000, timeout: 20000 })
}

async function createOrderWalletDebitInTransaction(tx: Prisma.TransactionClient, params: { orderId: string; organizationId: string; userId: string; amount: number; performedByRole?: string | null }) {
    if (!Number.isFinite(params.amount) || params.amount <= 0) throw new Error("INVALID_DEBIT_AMOUNT")
    await lockOrder(tx, params.orderId)
    const order = await tx.order.findUnique({ where: { id: params.orderId } })
    if (!order || order.organizationId !== params.organizationId || order.userId !== params.userId || order.paymentOwner !== "WALLET") throw new Error("INVALID_WALLET_ORDER")
    await lockWallet(tx, params.userId)
    await assertWalletPurchase(tx, params.userId, params.amount)
    const debit = await tx.walletTransaction.create({ data: { userId: params.userId, performedByRole: params.performedByRole ?? null, method: "manual", amount: -params.amount, status: "success" } })
    await tx.auditLog.create({ data: { action: "ORDER_WALLET_DEBIT", targetType: "ORDER", targetId: params.orderId, organizationId: params.organizationId, meta: JSON.stringify({ walletTransactionId: debit.id, amount: params.amount, userId: params.userId } satisfies DebitMeta) } })
    return debit
}

// Also used inside provider-status transactions, so status and refund commit together.
export async function reverseOrderWalletDebitInTransaction(tx: Prisma.TransactionClient, params: RefundParams) {
  await lockOrder(tx, params.orderId)
  const order = await tx.order.findUnique({ where: { id: params.orderId } })
  if (!order || (params.organizationId && order.organizationId !== params.organizationId)) throw new Error("INVALID_WALLET_ORDER")
  const where = { targetType: "ORDER", targetId: params.orderId, organizationId: order.organizationId }
  const debitLog = await tx.auditLog.findFirst({ where: { ...where, action: "ORDER_WALLET_DEBIT" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })
  const meta = parseMeta(debitLog?.meta ?? null) as DebitMeta | null
  if (!debitLog || !meta?.walletTransactionId || !meta.userId) return { reversed: false, message: "No wallet debit metadata found" }
  await lockWallet(tx, meta.userId)
  const debit = await tx.walletTransaction.findUnique({ where: { id: meta.walletTransactionId } })
  if (!debit || debit.userId !== meta.userId || debit.userId !== order.userId || debit.amount >= 0 || !Number.isFinite(debit.amount) || debit.status !== "success") throw new Error("INVALID_WALLET_DEBIT")
  const linkedRefund = await tx.walletTransaction.findUnique({ where: { refundOfTransactionId: debit.id } })
  if (linkedRefund) return { reversed: false, message: "Already reversed" }
  // Old releases recorded refunds only in audit logs. Recognize those without
  // allowing an earlier attempt's refund to suppress the current debit's refund.
  const logs = await tx.auditLog.findMany({ where: { ...where, action: "ORDER_WALLET_REVERSAL", createdAt: { gte: debitLog.createdAt } } })
  for (const log of logs) {
    const previous = parseMeta(log.meta)
    if (!previous?.creditTransactionId || (previous.walletTransactionId && previous.walletTransactionId !== debit.id)) continue
    const credit = await tx.walletTransaction.findUnique({ where: { id: previous.creditTransactionId } })
    if (credit && credit.userId === debit.userId && credit.amount === -debit.amount && credit.status === "success" && (!credit.refundOfTransactionId || credit.refundOfTransactionId === debit.id)) {
      await tx.walletTransaction.update({ where: { id: credit.id }, data: { refundOfTransactionId: debit.id } })
      return { reversed: false, message: "Already reversed" }
    }
  }
  const credit = await tx.walletTransaction.create({ data: { userId: debit.userId, performedByRole: "SYSTEM", method: "manual", amount: -debit.amount, status: "success", refundOfTransactionId: debit.id } })
  await tx.auditLog.create({ data: { ...where, action: "ORDER_WALLET_REVERSAL", meta: JSON.stringify({ reason: params.reason, walletTransactionId: debit.id, reversedAmount: -debit.amount, creditTransactionId: credit.id }) } })
  return { reversed: true, message: "Wallet reversed", creditTransactionId: credit.id }
}
export async function reverseOrderWalletDebitIfNeeded(params: RefundParams) {
  return db.$transaction(tx => reverseOrderWalletDebitInTransaction(tx, params), { maxWait: 10000, timeout: 20000 })
}

export async function reverseOrderProfitInTransaction(tx: Prisma.TransactionClient, params: {
  orderId: string
  organizationId?: string | null
  previousStatus?: string | null
  reason: string
}) {
  if (params.previousStatus !== "COMPLETED") {
    return { reversed: false, message: "Order was not completed, no profit to reverse" }
  }

  const whereBase: any = {
    targetType: "ORDER",
    targetId: params.orderId,
  }
  if (params.organizationId) {
    whereBase.organizationId = params.organizationId
  }

  const existing = await tx.auditLog.findFirst({
    where: {
      action: "ORDER_PROFIT_REVERSAL",
      ...whereBase,
    },
    select: { id: true },
  })

  if (existing) {
    return { reversed: false, message: "Already reversed" }
  }

  const profitAgg = await tx.orderItem.aggregate({
    _sum: { profit: true },
    where: { orderId: params.orderId },
  })

  const reversedAmount = profitAgg._sum.profit ?? 0
  if (reversedAmount <= 0) {
    return { reversed: false, message: "No profit found to reverse" }
  }

  const meta: ProfitReversalMeta = {
    reversedAmount,
    reason: params.reason,
  }

  await tx.auditLog.create({
    data: {
      action: "ORDER_PROFIT_REVERSAL",
      targetType: "ORDER",
      targetId: params.orderId,
      organizationId: params.organizationId ?? null,
      meta: JSON.stringify(meta),
    },
  })

  return { reversed: true, message: "Profit reversed", reversedAmount }
}

// Claim and charge a retry before any provider request. Concurrent retries see
// the committed PENDING status; a rapid second failure still observes backoff.
export async function prepareOrderWalletRetry(params: {
  orderId: string; organizationId: string; maxAttempts: number; backoffSeconds: number;
  actorId: string; actorName: string
}) {
  return db.$transaction(async tx => {
    await lockOrder(tx, params.orderId)
    const order = await tx.order.findUnique({ where: { id: params.orderId } })
    if (!order || order.organizationId !== params.organizationId || order.status !== "FAILED" || order.paymentStatus !== "PAID") throw new Error("ORDER_NOT_RETRYABLE")
    const retries = await tx.auditLog.findMany({ where: { targetType: "ORDER", targetId: order.id, action: { in: ["ORDER_RETRY_DISPATCH_STARTED", "ORDER_RETRY_DISPATCH"] } }, orderBy: { createdAt: "desc" } })
    const attempts = Math.max(retries.filter(row => row.action === "ORDER_RETRY_DISPATCH_STARTED").length, retries.filter(row => row.action === "ORDER_RETRY_DISPATCH").length)
    if (attempts >= params.maxAttempts) throw new Error("RETRY_LIMIT_REACHED")
    if (retries[0] && Date.now() - retries[0].createdAt.getTime() < params.backoffSeconds * 1000) throw new Error("RETRY_BACKOFF")
    if (order.paymentOwner === "WALLET") {
      if (!order.userId) throw new Error("INVALID_WALLET_ORDER")
      // A failed attempt must have a refundable debit before we charge again.
      const previous = await tx.auditLog.findFirst({ where: { targetType: "ORDER", targetId: order.id, organizationId: order.organizationId, action: "ORDER_WALLET_DEBIT" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })
      if (!previous) throw new Error("MISSING_RETRY_DEBIT")
      const debitId = parseMeta(previous.meta)?.walletTransactionId
      const originalDebit = typeof debitId === "string" ? await tx.walletTransaction.findUnique({ where: { id: debitId } }) : null
      if (!originalDebit || originalDebit.userId !== order.userId || originalDebit.amount >= 0 || originalDebit.status !== "success") throw new Error("MISSING_RETRY_DEBIT")
      await reverseOrderWalletDebitInTransaction(tx, { orderId: order.id, organizationId: order.organizationId, reason: "Settle failed attempt before retry" })
      await createOrderWalletDebitInTransaction(tx, { orderId: order.id, organizationId: params.organizationId, userId: order.userId, amount: -originalDebit.amount, performedByRole: "SYSTEM" })
    }
    await tx.order.update({ where: { id: order.id }, data: { status: "PENDING" } })
    await tx.auditLog.create({ data: { action: "ORDER_RETRY_DISPATCH_STARTED", targetType: "ORDER", targetId: order.id, organizationId: order.organizationId, actorId: params.actorId, actorName: params.actorName, meta: JSON.stringify({ paymentOwner: order.paymentOwner }) } })
  }, { maxWait: 10000, timeout: 20000 })
}
