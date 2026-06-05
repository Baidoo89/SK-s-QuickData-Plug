import { requireOrgManager, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"

const ALLOWED_STATUSES = ["PENDING_REVIEW", "PROCESSING", "COMPLETED", "FAILED", "REJECTED"] as const
type AllowedStatus = (typeof ALLOWED_STATUSES)[number]
const PAYMENT_LOCKED_STATUSES = new Set(["PENDING_PAYMENT", "PAYMENT_FAILED", "PAYMENT_INIT_FAILED"])

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) {
      return authResult
    }

    const organizationId = authResult.user.organizationId
    const body = await req.json().catch(() => null)
    const status = (body?.status ?? "") as string

    if (!ALLOWED_STATUSES.includes(status as AllowedStatus)) {
      return ApiErrors.BAD_REQUEST("Invalid service request status")
    }

    const existing = await db.serviceRequest.findFirst({
      where: { id: params.id, organizationId: organizationId! },
      select: { id: true, organizationId: true, status: true },
    })

    if (!existing) {
      return ApiErrors.NOT_FOUND("Service request")
    }

    if (PAYMENT_LOCKED_STATUSES.has(existing.status)) {
      return ApiErrors.BAD_REQUEST("This service request has not completed payment and cannot be processed.")
    }

    const updated = await db.serviceRequest.update({
      where: { id: params.id },
      data: { status },
      select: { id: true, status: true, organizationId: true },
    })

    await db.auditLog.create({
      data: {
        actorId: authResult.user.id,
        actorName: authResult.user.email,
        action: "SERVICE_REQUEST_STATUS_UPDATE",
        targetType: "SERVICE_REQUEST",
        targetId: params.id,
        organizationId: updated.organizationId,
        meta: JSON.stringify({ from: existing.status, to: status }),
      },
    })

    return apiSuccess({ id: updated.id, status: updated.status })
  } catch (error) {
    logApiError("[DASHBOARD_SERVICE_REQUEST_STATUS_PATCH]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
