import { db } from "@/lib/db"

export type ManualOrderSetSummary = {
  id: string
  label: string
  orderIds: string[]
  pendingCount: number
  processingCount: number
  completedCount: number
}

type ClaimMeta = {
  manualSetId?: unknown
  manualSetLabel?: unknown
}

function parseMeta(value: string | null) {
  if (!value) return {} as ClaimMeta
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as ClaimMeta : {}
  } catch {
    return {} as ClaimMeta
  }
}

/**
 * Rebuilds active manual batches from their claim audit events. This keeps a
 * claimed set available after a refresh or when the owner returns later.
 */
export async function getActiveManualOrderSets(params: {
  organizationId: string | null
  superadmin?: boolean
}): Promise<ManualOrderSetSummary[]> {
  if (!params.superadmin && !params.organizationId) return []

  const logs = await db.auditLog.findMany({
    where: {
      action: "ORDER_MANUAL_CLAIMED",
      targetType: "ORDER",
      ...(params.superadmin ? {} : { organizationId: params.organizationId ?? undefined }),
    },
    select: { targetId: true, organizationId: true, meta: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  })

  const groups = new Map<string, { id: string; label: string; orderIds: Set<string>; createdAt: Date }>()
  for (const log of logs) {
    const meta = parseMeta(log.meta)
    const setId = typeof meta.manualSetId === "string" ? meta.manualSetId : ""
    if (!setId) continue

    const groupKey = `${log.organizationId ?? "global"}:${setId}`
    const existing = groups.get(groupKey)
    if (existing) {
      existing.orderIds.add(log.targetId)
      continue
    }

    groups.set(groupKey, {
      id: setId,
      label: typeof meta.manualSetLabel === "string" && meta.manualSetLabel.trim() ? meta.manualSetLabel : `Set ${groups.size + 1}`,
      orderIds: new Set([log.targetId]),
      createdAt: log.createdAt,
    })
  }

  if (groups.size === 0) return []

  const orderIds = Array.from(groups.values()).flatMap((group) => Array.from(group.orderIds))
  const orders = await db.order.findMany({
    where: {
      id: { in: orderIds },
      ...(params.superadmin ? {} : { organizationId: params.organizationId ?? undefined }),
    },
    select: { id: true, status: true },
  })
  const statusById = new Map(orders.map((order) => [order.id, order.status]))

  return Array.from(groups.values())
    .map((group) => {
      const statuses = Array.from(group.orderIds).map((id) => statusById.get(id)).filter((status): status is string => Boolean(status))
      return {
        id: group.id,
        label: group.label,
        orderIds: Array.from(group.orderIds),
        pendingCount: statuses.filter((status) => status === "PENDING").length,
        processingCount: statuses.filter((status) => status === "PROCESSING").length,
        completedCount: statuses.filter((status) => status === "COMPLETED").length,
        active: statuses.some((status) => status === "PENDING" || status === "PROCESSING"),
        createdAt: group.createdAt,
      }
    })
    .filter((group) => group.active)
    .map(({ active: _active, createdAt: _createdAt, ...summary }) => summary)
}
