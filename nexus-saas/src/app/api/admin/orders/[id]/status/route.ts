import { requireAdmin, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { notifyApiOrderStatus } from "@/lib/api-order-tracking"
import { reverseOrderProfitIfNeeded, reverseOrderWalletDebitIfNeeded } from "@/lib/order-wallet"

const ALLOWED_STATUSES = ["COMPLETED", "PROCESSING", "PENDING", "FAILED", "CANCELLED", "REFUNDED"] as const
type AllowedStatus = (typeof ALLOWED_STATUSES)[number]
const REVERSE_STATUSES = new Set(["FAILED", "CANCELLED", "REFUNDED"])
const PAYMENT_LOCKED_STATUSES = new Set(["PENDING_PAYMENT", "PAYMENT_FAILED", "PAYMENT_INIT_FAILED"])

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
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
      select: { id: true, organizationId: true, status: true },
    })

    if (!existing) {
      return ApiErrors.NOT_FOUND("Order")
    }

    if (PAYMENT_LOCKED_STATUSES.has(existing.status)) {
      return ApiErrors.BAD_REQUEST("This order has not completed payment and cannot be manually fulfilled.")
    }

    const updated = await db.order.update({
      where: { id: params.id },
      data: { status },
      select: { id: true, status: true, organizationId: true },
    })

    if (REVERSE_STATUSES.has(status) && existing.status !== status) {
      await reverseOrderWalletDebitIfNeeded({
        orderId: params.id,
        organizationId: updated.organizationId,
        reason: `Admin changed status to ${status}`,
      })

      await reverseOrderProfitIfNeeded({
        orderId: params.id,
        organizationId: updated.organizationId,
        previousStatus: existing.status,
        reason: `Admin changed status to ${status}`,
      })
    }

    await db.auditLog.create({
      data: {
        actorId: authResult.user.id,
        actorName: authResult.user.email,
        action: "ORDER_MANUAL_STATUS_UPDATE",
        targetType: "ORDER",
        targetId: params.id,
        organizationId: updated.organizationId,
        meta: JSON.stringify({ status }),
      },
    })

    if (existing.status !== updated.status) {
      await notifyApiOrderStatus(updated.id, updated.status)
    }

    return apiSuccess({ id: updated.id, status: updated.status })
  } catch (error) {
    logApiError("[ADMIN_ORDER_STATUS_PATCH]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
