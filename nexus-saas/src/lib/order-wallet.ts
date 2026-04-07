import { db } from "@/lib/db"

type DebitMeta = {
  walletTransactionId: string
  amount: number
  userId: string
}

type ProfitReversalMeta = {
  reversedAmount: number
  reason: string
}

function parseMeta(meta: string | null): any {
  if (!meta) return null
  try {
    return JSON.parse(meta)
  } catch {
    return null
  }
}

export async function createOrderWalletDebit(params: {
  orderId: string
  organizationId: string
  userId: string
  amount: number
  performedByRole?: string | null
}) {
  const wallet = (db as any)["walletTransaction"] as any

  const balanceAgg = await wallet.aggregate({
    _sum: { amount: true },
    where: { userId: params.userId, status: "success" },
  })

  const balance: number = balanceAgg._sum.amount ?? 0
  if (balance < params.amount) {
    throw new Error("INSUFFICIENT_FUNDS")
  }

  const debit = await wallet.create({
    data: {
      userId: params.userId,
      performedByEmail: null,
      performedByRole: params.performedByRole ?? null,
      method: "manual",
      amount: -params.amount,
      status: "success",
    },
  })

  const meta: DebitMeta = {
    walletTransactionId: debit.id,
    amount: params.amount,
    userId: params.userId,
  }

  await db.auditLog.create({
    data: {
      action: "ORDER_WALLET_DEBIT",
      targetType: "ORDER",
      targetId: params.orderId,
      organizationId: params.organizationId,
      meta: JSON.stringify(meta),
    },
  })

  return debit
}

export async function reverseOrderWalletDebitIfNeeded(params: {
  orderId: string
  organizationId?: string | null
  reason: string
}) {
  const whereBase: any = {
    targetType: "ORDER",
    targetId: params.orderId,
  }
  if (params.organizationId) {
    whereBase.organizationId = params.organizationId
  }

  const existing = await db.auditLog.findFirst({
    where: {
      action: "ORDER_WALLET_REVERSAL",
      ...whereBase,
    },
    select: { id: true },
  })

  if (existing) {
    return { reversed: false, message: "Already reversed" }
  }

  const debitLog = await db.auditLog.findFirst({
    where: {
      action: "ORDER_WALLET_DEBIT",
      ...whereBase,
    },
    orderBy: { createdAt: "desc" },
    select: { meta: true },
  })

  const parsed = parseMeta(debitLog?.meta ?? null) as DebitMeta | null
  if (!parsed?.userId || !parsed?.amount) {
    return { reversed: false, message: "No wallet debit metadata found" }
  }

  const wallet = (db as any)["walletTransaction"] as any
  const credit = await wallet.create({
    data: {
      userId: parsed.userId,
      performedByEmail: null,
      performedByRole: "SYSTEM",
      method: "manual",
      amount: Math.abs(parsed.amount),
      status: "success",
    },
  })

  await db.auditLog.create({
    data: {
      action: "ORDER_WALLET_REVERSAL",
      targetType: "ORDER",
      targetId: params.orderId,
      organizationId: params.organizationId ?? null,
      meta: JSON.stringify({
        reason: params.reason,
        reversedAmount: Math.abs(parsed.amount),
        creditTransactionId: credit.id,
      }),
    },
  })

  return { reversed: true, message: "Wallet reversed", creditTransactionId: credit.id }
}

export async function reverseOrderProfitIfNeeded(params: {
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

  const existing = await db.auditLog.findFirst({
    where: {
      action: "ORDER_PROFIT_REVERSAL",
      ...whereBase,
    },
    select: { id: true },
  })

  if (existing) {
    return { reversed: false, message: "Already reversed" }
  }

  const profitAgg = await db.orderItem.aggregate({
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

  await db.auditLog.create({
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
