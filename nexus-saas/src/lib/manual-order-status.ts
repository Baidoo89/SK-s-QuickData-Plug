import { db } from "@/lib/db"
import { notifyApiOrderStatus } from "@/lib/api-order-tracking"
import { reverseOrderProfitInTransaction, reverseOrderWalletDebitInTransaction } from "@/lib/order-wallet"

const reversalStatuses = new Set(["FAILED", "CANCELLED", "REFUNDED"])
const allowedStatuses = new Set(["PENDING", "PROCESSING", "COMPLETED", ...reversalStatuses])

export async function applyManualOrderStatus(input: {
  orderId: string; organizationId: string | null; status: string;
  actorId: string; actorName: string; action: string;
  expectedStatuses?: string[]; manualOnly?: boolean
}) {
  if (!allowedStatuses.has(input.status)) throw new Error("INVALID_ORDER_STATUS_TRANSITION")
  const result = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${input.orderId} FOR UPDATE`
    const existing = await tx.order.findUnique({ where: { id: input.orderId } })
    if (!existing || existing.organizationId !== input.organizationId) throw new Error("ORDER_STATUS_CONFLICT")
    if (input.expectedStatuses && !input.expectedStatuses.includes(existing.status)) return null
    if (input.manualOnly && existing.fulfillmentMode !== "MANUAL") return null
    if (existing.paymentStatus !== "PAID" || ["PENDING_PAYMENT", "PAYMENT_FAILED", "PAYMENT_INIT_FAILED"].includes(existing.status)) throw new Error("ORDER_NOT_PAID")
    // Returning a failed/refunded order to fulfillment requires the retry flow,
    // which verifies payment and charges the next attempt atomically.
    if (existing.status !== input.status && (
      (reversalStatuses.has(existing.status) && !reversalStatuses.has(input.status)) ||
      (existing.status === "COMPLETED" && !reversalStatuses.has(input.status)) ||
      (existing.status === "PROCESSING" && input.status === "PENDING")
    )) throw new Error("INVALID_ORDER_STATUS_TRANSITION")
    const updated = await tx.order.update({ where: { id: existing.id }, data: { status: input.status }, select: { id: true, status: true, organizationId: true } })
    if (reversalStatuses.has(input.status)) {
      const reason = `Manual action marked ${input.status.toLowerCase()}`
      await reverseOrderWalletDebitInTransaction(tx, { orderId: existing.id, organizationId: existing.organizationId, reason })
      await reverseOrderProfitInTransaction(tx, { orderId: existing.id, organizationId: existing.organizationId, previousStatus: existing.status, reason })
    }
    await tx.auditLog.create({ data: { actorId: input.actorId, actorName: input.actorName, action: input.action, targetType: "ORDER", targetId: existing.id, organizationId: existing.organizationId, meta: JSON.stringify({ previousStatus: existing.status, status: input.status }) } })
    return { updated, changed: existing.status !== updated.status }
  }, { maxWait: 10000, timeout: 20000 })
  if (result?.changed) await notifyApiOrderStatus(result.updated.id, result.updated.status)
  return result?.updated ?? null
}
