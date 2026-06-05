import { db } from "@/lib/db"

export type OrderSource = "API" | "STOREFRONT" | "AGENT" | "RESELLER" | "DASHBOARD"
export type OrderChannelSource = "API" | "STOREFRONT" | "DASHBOARD_BUY"

type OrderSourceCandidate = {
  id: string
  source?: string | null
  sellerRole?: string | null
  agentId?: string | null
  user?: {
    role?: string | null
  } | null
}

export const ORDER_SOURCE_LABELS: Record<OrderSource, string> = {
  API: "API",
  STOREFRONT: "Storefront",
  AGENT: "Agent",
  RESELLER: "Reseller",
  DASHBOARD: "Dashboard",
}

export async function getOrderSourceLogMap(orderIds: string[]) {
  if (orderIds.length === 0) {
    return new Map<string, OrderSource>()
  }

  const logs = await db.auditLog.findMany({
    where: {
      targetType: "ORDER",
      targetId: { in: orderIds },
      action: { in: ["API_ORDER_CREATED", "STOREFRONT_CHECKOUT_CREATED"] },
    },
    orderBy: { createdAt: "desc" },
    select: { action: true, targetId: true },
  })

  const out = new Map<string, OrderSource>()
  for (const log of logs) {
    if (out.has(log.targetId)) continue
    out.set(log.targetId, log.action === "API_ORDER_CREATED" ? "API" : "STOREFRONT")
  }

  return out
}

export function resolveOrderSource(order: OrderSourceCandidate, sourceLogs: Map<string, OrderSource>): OrderSource {
  if (order.source === "API") return "API"
  if (order.source === "STOREFRONT") return "STOREFRONT"
  if (order.source === "DASHBOARD_BUY") {
    if (order.sellerRole === "RESELLER") return "RESELLER"
    if (order.sellerRole === "AGENT") return "AGENT"
    return "DASHBOARD"
  }

  const loggedSource = sourceLogs.get(order.id)
  if (loggedSource) return loggedSource

  if (order.user?.role === "RESELLER") return "RESELLER"
  if (order.user?.role === "AGENT" || order.agentId) return "AGENT"

  return "DASHBOARD"
}
