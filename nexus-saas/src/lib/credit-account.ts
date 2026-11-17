import type { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { lockWallet } from "@/lib/wallet-lock"
import { getWalletBalance, moneyToMinor, minorToMoney } from "@/lib/money"

type Actor = { id: string; role: string; organizationId: string | null; email: string }
const sellerRoles = ["SUBSCRIBER", "AGENT", "RESELLER"]
function mayManage(actor: Actor, target: { id: string; role: string; organizationId: string | null }) {
  return sellerRoles.includes(target.role) && (actor.role === "SUPERADMIN" || (actor.role === "SUBSCRIBER" && actor.organizationId !== null && target.organizationId === actor.organizationId && ["AGENT", "RESELLER"].includes(target.role)))
}
function endOfBusinessDay(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
}

// Call inside the same transaction as the debit. No credit is available unless
// explicitly approved. Negative ledger balance is the outstanding debt.
export async function assertWalletPurchase(tx: Prisma.TransactionClient, userId: string, amount: number) {
  const chargeMinor = moneyToMinor(amount)
  if (chargeMinor < 0) throw new Error("INVALID_MONEY")
  await lockWallet(tx, userId)
  const user = await tx.user.findUnique({ where: { id: userId }, select: { organizationId: true, active: true, signupStatus: true } })
  if (!user?.active || user.signupStatus !== "APPROVED") throw new Error("WALLET_ACCOUNT_RESTRICTED")
  const balanceMinor = moneyToMinor(await getWalletBalance(tx, userId))
  const nextMinor = balanceMinor - chargeMinor
  minorToMoney(nextMinor)
  if (nextMinor >= 0) return
  const account = await tx.creditAccount.findUnique({ where: { userId } })
  if (!account?.enabled || account.organizationId !== user?.organizationId || BigInt(-nextMinor) > account.limitMinor) throw new Error("INSUFFICIENT_FUNDS")
  const now = new Date()
  if (balanceMinor < 0 && account.dueAt && account.dueAt <= now) throw new Error("CREDIT_OVERDUE")
  if (balanceMinor >= 0 || !account.dueAt) await tx.creditAccount.update({ where: { userId }, data: { dueAt: endOfBusinessDay(now) } })
}

export async function configureCredit(actor: Actor, input: { userId: string; enabled: boolean; limit: number; note: string }) {
  const limitMinor = moneyToMinor(input.limit)
  if (limitMinor < 0 || (input.enabled && limitMinor === 0) || input.note.trim().length < 3 || input.note.length > 500) throw new Error("INVALID_CREDIT_LIMIT")
  return db.$transaction(async tx => {
    await lockWallet(tx, input.userId)
    const target = await tx.user.findUnique({ where: { id: input.userId } })
    if (!target || !target.organizationId || !mayManage(actor, target)) throw new Error("CREDIT_FORBIDDEN")
    const before = await tx.creditAccount.findUnique({ where: { userId: target.id } })
    if (before && before.organizationId !== target.organizationId) throw new Error("CREDIT_FORBIDDEN")
    const balance = await getWalletBalance(tx, target.id)
    const dueAt = balance < 0 ? before?.dueAt ?? (input.enabled ? endOfBusinessDay(new Date()) : null) : null
    const values = { dueAt, enabled: input.enabled, limitMinor: BigInt(limitMinor), approvedByUserId: actor.id, note: input.note.trim() }
    const saved = await tx.creditAccount.upsert({ where: { userId: target.id }, update: values, create: { userId: target.id, organizationId: target.organizationId, ...values } })
    await tx.auditLog.create({ data: { action: "CREDIT_LIMIT_CHANGED", targetType: "USER", targetId: target.id, organizationId: target.organizationId, actorId: actor.id, actorName: actor.email, meta: JSON.stringify({ previousLimitMinor: before?.limitMinor.toString() ?? "0", limitMinor: saved.limitMinor.toString(), enabled: saved.enabled, note: saved.note }) } })
    return { userId: saved.userId, enabled: saved.enabled, limit: minorToMoney(Number(saved.limitMinor)) }
  }, { maxWait: 10000, timeout: 20000 })
}

export async function listCreditAccounts(actor: Actor, query = "") {
  const manager = ["SUBSCRIBER", "SUPERADMIN"].includes(actor.role)
  const scope: Prisma.UserWhereInput = actor.role === "SUPERADMIN" ? { role: { in: sellerRoles } } : actor.role === "SUBSCRIBER" && actor.organizationId ? { organizationId: actor.organizationId, OR: [{ id: actor.id }, { role: { in: ["AGENT", "RESELLER"] } }] } : { id: actor.id }
  const users = await db.user.findMany({ where: { AND: [scope, ...(query ? [{ OR: [{ email: { contains: query, mode: "insensitive" as const } }, { name: { contains: query, mode: "insensitive" as const } }] }] : [])] }, include: { creditAccount: true, organization: { select: { name: true } } }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 100 })
  const rows = await Promise.all(users.map(async user => {
    const balance = await getWalletBalance(db, user.id)
    const account = user.creditAccount
    const owed = Math.max(-balance, 0)
    const overdue = owed > 0 && Boolean(account?.dueAt && account.dueAt <= new Date())
    const limit = account?.enabled ? minorToMoney(Number(account.limitMinor)) : 0
    return { userId: user.id, name: user.name, email: user.email, role: user.role, organization: user.organization?.name ?? "", enabled: account?.enabled ?? false, limit: account ? minorToMoney(Number(account.limitMinor)) : 0, balance, owed, overdue, dueAt: owed > 0 ? account?.dueAt?.toISOString() ?? null : null, availableToSpend: overdue ? 0 : Math.max(minorToMoney(moneyToMinor(balance) + moneyToMinor(limit)), 0), isSelf: user.id === actor.id, canEdit: mayManage(actor, user) }
  }))
  return { canManage: manager, rows, limit: 100 }
}
