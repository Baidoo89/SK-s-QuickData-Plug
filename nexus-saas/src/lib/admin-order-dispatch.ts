import { db } from "@/lib/db"

export type DispatchMeta = {
  mode?: "API" | "MANUAL"
  provider?: string
  network?: string
  reason?: string
  providerKey?: string
  providerKeys?: string[]
  fallback?: boolean
  attemptedProviders?: Array<{
    providerKey?: string
    message?: string
    retryable?: boolean
    accepted?: boolean
  }>
}

function parseDispatchMeta(meta: string | null): DispatchMeta {
  if (!meta) return {}
  try {
    const parsed = JSON.parse(meta) as DispatchMeta
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

export async function getDispatchMetaByOrderIds(orderIds: string[]) {
  if (orderIds.length === 0) {
    return new Map<string, DispatchMeta>()
  }

  const logs = await db.auditLog.findMany({
    where: {
      action: { in: ["ORDER_DISPATCH_DECISION", "ORDER_DISPATCH_MANUAL_FALLBACK"] },
      targetType: "ORDER",
      targetId: { in: orderIds },
    },
    orderBy: { createdAt: "desc" },
    select: { targetId: true, action: true, meta: true },
  })

  const out = new Map<string, DispatchMeta>()
  for (const log of logs) {
    if (out.has(log.targetId)) continue
    const parsed = parseDispatchMeta(log.meta)
    if (log.action === "ORDER_DISPATCH_MANUAL_FALLBACK") {
      out.set(log.targetId, {
        ...parsed,
        mode: "MANUAL",
        provider: parsed.provider || "Manual fallback",
        fallback: true,
      })
      continue
    }

    out.set(log.targetId, parsed)
  }

  return out
}
