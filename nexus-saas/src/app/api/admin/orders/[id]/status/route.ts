import { requireAdmin, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { applyManualOrderStatus } from "@/lib/manual-order-status"

const ALLOWED_STATUSES = ["COMPLETED", "PROCESSING", "PENDING", "FAILED", "CANCELLED", "REFUNDED"] as const
type AllowedStatus = (typeof ALLOWED_STATUSES)[number]
const PAYMENT_LOCKED_STATUSES = new Set(["PENDING_PAYMENT", "PAYMENT_FAILED", "PAYMENT_INIT_FAILED"])

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const authResult = await requireAdmin()
    if (isAuthError(authResult)) {
      return authResult
    }

    const isSuperAdmin = authResult.user.role === "SUPERADMIN"
    const organizationId = authResult.user.organizationId

    const body = await req.json().catch(() => null)
    const status = (body?.status ?? "") as string

    if (!ALLOWED_STATUSES.includes(status as AllowedStatus)) {
      return ApiErrors.BAD_REQUEST("Invalid status")
    }

    const existing = await db.order.findFirst({
      where: {
        id: params.id,
        ...(isSuperAdmin ? {} : { organizationId: organizationId! }),
      },
      select: { id: true, organizationId: true, status: true, paymentStatus: true },
    })

    if (!existing) {
      return ApiErrors.NOT_FOUND("Order")
    }

    if (PAYMENT_LOCKED_STATUSES.has(existing.status)) {
      return ApiErrors.BAD_REQUEST("This order has not completed payment and cannot be manually fulfilled.")
    }

    if (existing.paymentStatus !== "PAID") {
      return ApiErrors.BAD_REQUEST("Only paid orders can be manually fulfilled.")
    }

    const updated = await applyManualOrderStatus({ orderId: existing.id, organizationId: existing.organizationId, status, actorId: authResult.user.id, actorName: authResult.user.email, action: "ORDER_MANUAL_STATUS_UPDATE" })
    if (!updated) return ApiErrors.BAD_REQUEST("Order changed while updating; reload and try again.")

    return apiSuccess({ id: updated.id, status: updated.status })
  } catch (error) {
    if (error instanceof Error && ["ORDER_STATUS_CONFLICT", "ORDER_NOT_PAID", "INVALID_ORDER_STATUS_TRANSITION"].includes(error.message)) return ApiErrors.BAD_REQUEST("This status change is no longer allowed. Reload the order; use retry for a failed order.")
    logApiError("[ADMIN_ORDER_STATUS_PATCH]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
