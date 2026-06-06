import { db } from "@/lib/db"
import { notifyApiOrderStatus } from "@/lib/api-order-tracking"
import { reverseOrderProfitIfNeeded, reverseOrderWalletDebitIfNeeded } from "@/lib/order-wallet"

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
  const existing = await db.order.findUnique({
    where: { id: input.orderId },
    select: { id: true, organizationId: true, status: true },
  })

  if (!existing) return null

  const updated = await db.order.update({
    where: { id: input.orderId },
    data: { status: input.status },
    select: { id: true, status: true },
  })

  if (input.status === "FAILED") {
    await reverseOrderWalletDebitIfNeeded({
      orderId: input.orderId,
      organizationId: existing.organizationId,
      reason: `Provider ${input.source} failed`,
    })

    await reverseOrderProfitIfNeeded({
      orderId: input.orderId,
      organizationId: existing.organizationId,
      previousStatus: existing.status,
      reason: `Provider ${input.source} failed`,
    })
  }

  await db.auditLog.create({
    data: {
      action: input.source === "poll" ? "ORDER_PROVIDER_STATUS_SYNC" : "ORDER_PROVIDER_CALLBACK",
      targetType: "ORDER",
      targetId: input.orderId,
      organizationId: existing.organizationId,
      meta: JSON.stringify({
        previousStatus: existing.status,
        status: input.status,
        externalRef: input.externalRef || null,
        message: input.message || null,
        source: input.source,
      }),
    },
  })

  if (existing.status !== updated.status) {
    await notifyApiOrderStatus(updated.id, updated.status)
  }

  return updated
}
