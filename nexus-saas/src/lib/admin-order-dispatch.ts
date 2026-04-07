import { db } from "@/lib/db"

export type DispatchMeta = {
  mode?: "API" | "MANUAL"
  provider?: string
  network?: string
  reason?: string
}

export async function getDispatchMetaByOrderIds(orderIds: string[]) {
  if (orderIds.length === 0) {
    return new Map<string, DispatchMeta>()
  }

  const logs = await db.auditLog.findMany({
    where: {
      action: "ORDER_DISPATCH_DECISION",
      targetType: "ORDER",
      targetId: { in: orderIds },
    },
    orderBy: { createdAt: "desc" },
    select: { targetId: true, meta: true },
  })

  const out = new Map<string, DispatchMeta>()
  for (const log of logs) {
    if (out.has(log.targetId)) continue
    try {
      out.set(log.targetId, log.meta ? (JSON.parse(log.meta) as DispatchMeta) : {})
    } catch {
      out.set(log.targetId, {})
    }
  }

  return out
}
