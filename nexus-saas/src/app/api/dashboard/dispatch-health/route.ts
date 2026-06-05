import { requireOrgManager, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { getDispatchHealth } from "@/lib/dispatch-health"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) return authResult

    const health = await getDispatchHealth(authResult.user.organizationId!)
    return apiSuccess({
      attempts24h: health.attempts24h,
      failedDispatches24h: health.failedDispatches24h,
      stalePendingApiOrders: health.stalePendingApiOrders,
      staleMinutes: health.staleMinutes,
      alert: health.alert,
    })
  } catch (error) {
    logApiError("[DASHBOARD_DISPATCH_HEALTH_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
