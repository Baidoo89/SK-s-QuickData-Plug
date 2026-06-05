import { requireAuth, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { getOrderTimeline } from "@/lib/order-timeline"

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) return authResult

    const user = await db.user.findUnique({
      where: { id: authResult.user.id },
      select: { id: true, role: true, agentId: true, organizationId: true, name: true },
    })

    if (!user || user.role !== "AGENT" || !user.organizationId) {
      return ApiErrors.FORBIDDEN()
    }

    let agentId = user.agentId
    if (!agentId) {
      const fallbackAgent = await db.agent.findFirst({
        where: { organizationId: user.organizationId, name: user.name ?? undefined },
        select: { id: true },
      })
      agentId = fallbackAgent?.id ?? null
    }

    const order = await db.order.findFirst({
      where: {
        id: params.id,
        organizationId: user.organizationId,
        OR: [{ userId: user.id }, ...(agentId ? [{ agentId }] : [])],
      },
      select: { id: true },
    })

    if (!order) {
      return ApiErrors.NOT_FOUND("Order")
    }

    const timeline = await getOrderTimeline({
      orderId: params.id,
      organizationId: user.organizationId,
    })

    if (!timeline) {
      return ApiErrors.NOT_FOUND("Order")
    }

    return apiSuccess(timeline)
  } catch (error) {
    logApiError("[AGENT_ORDER_TIMELINE_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
