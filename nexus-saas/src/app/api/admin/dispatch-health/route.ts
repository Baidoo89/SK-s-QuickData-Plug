import { requireAdmin, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { getDispatchHealth } from "@/lib/dispatch-health"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  try {
    const authResult = await requireAdmin()
    if (isAuthError(authResult)) {
      return authResult
    }

    const now = new Date()
    const health = await getDispatchHealth(null)
    const hasAlert = health.alert

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
              failedDispatches24h: health.failedDispatches24h,
              stalePendingApiOrders: health.stalePendingApiOrders,
              thresholds: health.thresholds,
            }),
          },
        })
      }
    }

    return apiSuccess({
      attempts24h: health.attempts24h,
      failedDispatches24h: health.failedDispatches24h,
      stalePendingApiOrders: health.stalePendingApiOrders,
      staleMinutes: health.staleMinutes,
      alert: hasAlert,
    })
  } catch (error) {
    logApiError("[DISPATCH_HEALTH_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
