import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"
import { moneyToMinor, minorToMoney, subtractMoney } from "@/lib/money"

type WithdrawableSummaryOptions = { excludeWithdrawalRequestId?: string }
const asMoney = (value: string) => minorToMoney(moneyToMinor(value))

export async function getUserWithdrawableSummary(userId: string, options: WithdrawableSummaryOptions = {}, client: Prisma.TransactionClient = db) {
  const user = await client.user.findUnique({ where: { id: userId }, select: { id: true, role: true, organizationId: true, agentId: true } })
  if (!user) return { profitEarned: 0, paidOut: 0, lockedAmount: 0, availableBalance: 0, requesterRole: "UNKNOWN" }
  let agentId = user.agentId
  if (user.role === "AGENT" && !agentId && user.organizationId) {
    agentId = (await client.agent.findFirst({ where: { organizationId: user.organizationId, user: { id: user.id } }, select: { id: true } }))?.id ?? null
  }
  let profitEarned = 0
  if (user.organizationId && (user.role === "RESELLER" || (user.role === "AGENT" && agentId))) {
    const sellerScope = user.role === "AGENT"
      ? Prisma.sql`o."agentId" = ${agentId} AND (o."userId" IS NULL OR o."userId" = ${user.id})`
      : Prisma.sql`o."userId" = ${user.id}`
    const rows = await client.$queryRaw<Array<{ amount: string }>>`
      SELECT COALESCE(SUM(i."profit"::numeric), 0)::text AS amount
      FROM "OrderItem" i JOIN "Order" o ON o."id" = i."orderId"
      WHERE o."status" = 'COMPLETED' AND o."source" <> 'API' AND o."organizationId" = ${user.organizationId} AND ${sellerScope}
    `
    profitEarned = asMoney(rows[0].amount)
  }
  const exclusion = options.excludeWithdrawalRequestId ? Prisma.sql`AND "id" <> ${options.excludeWithdrawalRequestId}` : Prisma.empty
  const reservations = await client.$queryRaw<Array<{ status: string; amount: string }>>`
    SELECT "status", SUM("amount"::numeric)::text AS amount FROM "WithdrawalRequest"
    WHERE "userId" = ${user.id} AND "status" IN ('PAID', 'PENDING', 'APPROVED') ${exclusion}
    GROUP BY "status"
  `
  const paidOut = asMoney(reservations.find(row => row.status === "PAID")?.amount ?? "0")
  const lockedMinor = reservations.filter(row => row.status !== "PAID").reduce((sum, row) => sum + moneyToMinor(row.amount), 0)
  const lockedAmount = minorToMoney(lockedMinor)
  return { profitEarned, paidOut, lockedAmount, availableBalance: Math.max(subtractMoney(profitEarned, paidOut, lockedAmount), 0), requesterRole: user.role }
}
