import { db } from "@/lib/db"

function parseMeta(meta: string | null) {
  if (!meta) return null
  try {
    return JSON.parse(meta)
  } catch {
    return null
  }
}

export async function getDispatchHealth(organizationId?: string | null) {
  const now = new Date()
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const staleMinutes = Number(process.env.DISPATCH_HEALTH_PENDING_AGE_MINUTES || "30")
  const staleCutoff = new Date(now.getTime() - staleMinutes * 60 * 1000)
  const organizationFilter = organizationId ? { organizationId } : {}

  const [attemptLogs, errorLogs, apiDecisionLogs] = await Promise.all([
    db.auditLog.findMany({
      where: {
        action: "ORDER_DISPATCH_ATTEMPT",
        createdAt: { gte: last24h },
        ...organizationFilter,
      },
      select: { meta: true },
    }),
    db.auditLog.count({
      where: {
        action: "ORDER_DISPATCH_ERROR",
        createdAt: { gte: last24h },
        ...organizationFilter,
      },
    }),
    db.auditLog.findMany({
      where: {
        action: "ORDER_DISPATCH_DECISION",
        meta: { contains: '"mode":"API"' },
        ...organizationFilter,
      },
      orderBy: { createdAt: "desc" },
      select: { targetId: true },
    }),
  ])

  let attempts = 0
  let rejectedAttempts = 0

  for (const row of attemptLogs) {
    attempts += 1
    const meta = parseMeta(row.meta)
    if (!meta?.accepted) {
      rejectedAttempts += 1
    }
  }

  const apiOrderIds = Array.from(new Set(apiDecisionLogs.map((log) => log.targetId)))
  const stalePendingApiOrders = apiOrderIds.length
    ? await db.order.count({
        where: {
          id: { in: apiOrderIds },
          status: "PENDING",
          createdAt: { lte: staleCutoff },
          ...organizationFilter,
        },
      })
    : 0

  const failedDispatches24h = rejectedAttempts + errorLogs
  const failThreshold = Number(process.env.DISPATCH_HEALTH_ALERT_FAIL_THRESHOLD || "20")
  const staleThreshold = Number(process.env.DISPATCH_HEALTH_ALERT_STALE_THRESHOLD || "30")

  return {
    attempts24h: attempts,
    failedDispatches24h,
    stalePendingApiOrders,
    staleMinutes,
    alert: failedDispatches24h >= failThreshold || stalePendingApiOrders >= staleThreshold,
    thresholds: { failThreshold, staleThreshold },
  }
}
