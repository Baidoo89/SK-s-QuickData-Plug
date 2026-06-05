import { requireAdmin, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { getOrderTimeline } from "@/lib/order-timeline"

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const authResult = await requireAdmin()
    if (isAuthError(authResult)) return authResult

    const timeline = await getOrderTimeline({
      orderId: params.id,
      organizationId: authResult.user.organizationId,
      superadmin: authResult.user.role === "SUPERADMIN",
    })

    if (!timeline) {
      return ApiErrors.NOT_FOUND("Order")
    }

    return apiSuccess(timeline)
  } catch (error) {
    logApiError("[ADMIN_ORDER_TIMELINE_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
