import { requireOrgManager, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { getOrderTimeline } from "@/lib/order-timeline"

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const authResult = await requireOrgManager()
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
    logApiError("[ORDER_TIMELINE_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
