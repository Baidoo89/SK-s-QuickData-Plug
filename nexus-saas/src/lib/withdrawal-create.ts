import { db } from "@/lib/db"
import { lockWallet } from "@/lib/wallet-lock"
import { moneyToMinor } from "@/lib/money"
import { getUserWithdrawableSummary } from "@/lib/withdrawal-balance"

type Actor = { id: string; email: string; role: string; organizationId: string | null }
export async function createWithdrawalRequest(actor: Actor, amount: number, note: string) {
  if (moneyToMinor(amount) <= 0) throw new Error("INVALID_MONEY")
  return db.$transaction(async tx => {
    await lockWallet(tx, actor.id)
    const current = await tx.user.findUnique({ where: { id: actor.id } })
    if (!current || !["AGENT", "RESELLER"].includes(current.role) || current.organizationId !== actor.organizationId || !current.organizationId || !current.active || current.signupStatus !== "APPROVED") throw new Error("WITHDRAWAL_FORBIDDEN")
    const summary = await getUserWithdrawableSummary(actor.id, {}, tx)
    if (moneyToMinor(amount) > moneyToMinor(summary.availableBalance)) throw new Error("INSUFFICIENT_EARNINGS")
    const created = await tx.withdrawalRequest.create({ data: { userId: current.id, organizationId: current.organizationId, amount, status: "PENDING", note: note || null, requestedByEmail: current.email, requestedByRole: current.role } })
    await tx.auditLog.create({ data: { action: "WITHDRAWAL_REQUESTED", targetType: "WITHDRAWAL_REQUEST", targetId: created.id, organizationId: current.organizationId, actorId: current.id, actorName: current.email, meta: JSON.stringify({ amount: created.amount, role: current.role }) } })
    return { created, summary: await getUserWithdrawableSummary(actor.id, {}, tx) }
  }, { maxWait: 10000, timeout: 20000 })
}
