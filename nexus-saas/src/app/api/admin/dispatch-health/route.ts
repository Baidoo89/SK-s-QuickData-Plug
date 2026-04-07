import { requireOrgManager, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function parseMeta(meta: string | null) {
  if (!meta) return null
  try {
    return JSON.parse(meta)
  } catch {
    return null
  }
}

export async function GET() {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) {
      return authResult
    }

    const isSuperAdmin = authResult.user.role === "SUPERADMIN"
    const organizationId = authResult.user.organizationId

    const now = new Date()
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const staleMinutes = Number(process.env.DISPATCH_HEALTH_PENDING_AGE_MINUTES || "30")
    const staleCutoff = new Date(now.getTime() - staleMinutes * 60 * 1000)

    const [attemptLogs, errorLogs, apiDecisionLogs] = await Promise.all([
      db.auditLog.findMany({
        where: {
          action: "ORDER_DISPATCH_ATTEMPT",
          createdAt: { gte: last24h },
          ...(isSuperAdmin ? {} : { organizationId: organizationId! }),
        },
        select: { meta: true },
      }),
      db.auditLog.count({
        where: {
          action: "ORDER_DISPATCH_ERROR",
          createdAt: { gte: last24h },
          ...(isSuperAdmin ? {} : { organizationId: organizationId! }),
        },
      }),
      db.auditLog.findMany({
        where: {
          action: "ORDER_DISPATCH_DECISION",
          meta: { contains: '"mode":"API"' },
          ...(isSuperAdmin ? {} : { organizationId: organizationId! }),
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

    const apiOrderIds = Array.from(new Set(apiDecisionLogs.map((l) => l.targetId)))

    const stalePendingApiOrders = apiOrderIds.length
      ? await db.order.count({
          where: {
            id: { in: apiOrderIds },
            status: "PENDING",
            createdAt: { lte: staleCutoff },
            ...(isSuperAdmin ? {} : { organizationId: organizationId! }),
          },
        })
      : 0

    const failedDispatches24h = rejectedAttempts + errorLogs

    const failThreshold = Number(process.env.DISPATCH_HEALTH_ALERT_FAIL_THRESHOLD || "20")
    const staleThreshold = Number(process.env.DISPATCH_HEALTH_ALERT_STALE_THRESHOLD || "30")

    const hasAlert = failedDispatches24h >= failThreshold || stalePendingApiOrders >= staleThreshold

    if (hasAlert) {
      const hourBucket = now.toISOString().slice(0, 13)
      const alertTargetId = `dispatch-health-${hourBucket}`
      const existing = await db.auditLog.findFirst({
        where: {
          action: "DISPATCH_HEALTH_ALERT",
          targetType: "SYSTEM",
          targetId: alertTargetId,
        },
        select: { id: true },
      })

      if (!existing) {
        await db.auditLog.create({
          data: {
            actorId: authResult.user.id,
            actorName: authResult.user.email,
            action: "DISPATCH_HEALTH_ALERT",
            targetType: "SYSTEM",
            targetId: alertTargetId,
            meta: JSON.stringify({
              failedDispatches24h,
              stalePendingApiOrders,
              thresholds: { failThreshold, staleThreshold },
            }),
          },
        })
      }
    }

    return apiSuccess({
      attempts24h: attempts,
      failedDispatches24h,
      stalePendingApiOrders,
      staleMinutes,
      alert: hasAlert,
    })
  } catch (error) {
    logApiError("[DISPATCH_HEALTH_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
