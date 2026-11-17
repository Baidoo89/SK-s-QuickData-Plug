import { recordFinancialReviewInTransaction } from "@/lib/financial-review"
import { db } from "@/lib/db"
import { notifyApiOrderStatus } from "@/lib/api-order-tracking"
import { reverseOrderWalletDebitInTransaction } from "@/lib/order-wallet"

export type ProviderOrderStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"

export function normalizeProviderOrderStatus(value: unknown): ProviderOrderStatus {
  const normalized = String(value || "").trim().toUpperCase()

  if (["DELIVERED", "COMPLETED", "SUCCESS", "SUCCESSFUL"].includes(normalized)) return "COMPLETED"
  if (["FAILED", "FAIL", "REJECTED", "CANCELLED", "CANCELED"].includes(normalized)) return "FAILED"
  if (["PROCESSING", "SENT", "IN_PROGRESS"].includes(normalized)) return "PROCESSING"
  return "PENDING"
}

export async function findOrderByProviderReference(externalRef: string) {
  const normalizedRef = externalRef.trim()
  if (!normalizedRef) return null

  const logs = await db.auditLog.findMany({
    where: {
      action: "ORDER_DISPATCH_ATTEMPT",
      meta: { contains: normalizedRef },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { targetId: true, meta: true },
  })

  const matchedLog = logs.find((log) => {
    try {
      const meta = JSON.parse(log.meta || "{}")
      return meta?.externalRef === normalizedRef
    } catch {
      return false
    }
  })

  if (!matchedLog?.targetId) return null

  return db.order.findUnique({
    where: { id: matchedLog.targetId },
    select: {
      id: true,
      organizationId: true,
      status: true,
    },
  })
}

export async function applyProviderStatusUpdate(input: {
  orderId: string
  status: ProviderOrderStatus
  externalRef?: string | null
  message?: string | null
  source: "callback" | "poll"
}) {
  const result = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${input.orderId} FOR UPDATE`
    const existing = await tx.order.findUnique({ where: { id: input.orderId }, select: { id: true, organizationId: true, status: true } })
    if (!existing) return null
    const latestAttempt = (input.externalRef || input.source === "callback") ? await tx.auditLog.findFirst({ where: { targetType: "ORDER", targetId: input.orderId, action: "ORDER_DISPATCH_ATTEMPT" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { meta: true, createdAt: true } }) : null
    let latestReference: string | null = null
    try { latestReference = JSON.parse(latestAttempt?.meta || "{}").externalRef || null } catch { /* No usable reference; transition checks still apply. */ }
    const retry = input.source === "callback" ? await tx.auditLog.findFirst({ where: { targetType: "ORDER", targetId: input.orderId, action: "ORDER_RETRY_DISPATCH_STARTED" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }) : null
    // Callbacks for retried orders need the current provider reference. A bare
    // order ID cannot distinguish a delayed failure from the previous attempt.
    const ambiguousRetry = Boolean(retry && (!input.externalRef || !latestReference || !latestAttempt || latestAttempt.createdAt <= retry.createdAt))
    const staleReference = ambiguousRetry || Boolean(input.externalRef && latestReference && input.externalRef !== latestReference)
    const allowed = !staleReference && (existing.status === input.status ||
      (existing.status === "PENDING" && ["PROCESSING", "COMPLETED", "FAILED"].includes(input.status)) ||
      (existing.status === "PROCESSING" && ["COMPLETED", "FAILED"].includes(input.status)))
    if (!allowed) {
      if (!staleReference && ["COMPLETED", "FAILED", "CANCELLED", "REFUNDED"].includes(existing.status) && ["COMPLETED", "FAILED"].includes(input.status) && existing.status !== input.status) await recordFinancialReviewInTransaction(tx, { kind: "PROVIDER_CONFLICT", organizationId: existing.organizationId, targetType: "ORDER", targetId: existing.id, reference: input.externalRef, reason: `Provider outcome ${input.status} conflicts with final order status ${existing.status}.` })
      await tx.auditLog.create({ data: { action: "ORDER_PROVIDER_STATUS_IGNORED", targetType: "ORDER", targetId: input.orderId, organizationId: existing.organizationId, meta: JSON.stringify({ previousStatus: existing.status, incomingStatus: input.status, externalRef: input.externalRef || null, source: input.source }) } })
      return { order: { id: existing.id, status: existing.status }, changed: false }
    }
    const order = await tx.order.update({ where: { id: input.orderId }, data: { status: input.status }, select: { id: true, status: true } })
    if (input.status === "FAILED") await reverseOrderWalletDebitInTransaction(tx, { orderId: input.orderId, organizationId: existing.organizationId, reason: `Provider ${input.source} failed` })
    await tx.auditLog.create({ data: { action: input.source === "poll" ? "ORDER_PROVIDER_STATUS_SYNC" : "ORDER_PROVIDER_CALLBACK", targetType: "ORDER", targetId: input.orderId, organizationId: existing.organizationId, meta: JSON.stringify({ previousStatus: existing.status, status: input.status, externalRef: input.externalRef || null, message: input.message || null, source: input.source }) } })
    return { order, changed: existing.status !== order.status }
  }, { maxWait: 10000, timeout: 20000 })
  if (result?.changed) await notifyApiOrderStatus(result.order.id, result.order.status)
  return result?.order ?? null
}
