import { requireRole, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { updateAgentWithdrawalRequest } from "@/lib/withdrawal-review"

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const authResult = await requireRole("SUBSCRIBER")
    if (isAuthError(authResult)) {
      return authResult
    }

    const actor = authResult.user
    if (!actor.organizationId) {
      return ApiErrors.INVALID_ORGANIZATION()
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return ApiErrors.BAD_REQUEST("Invalid request body")
    }

    const result = await updateAgentWithdrawalRequest({
      requestId: params.id,
      actor,
      organizationId: actor.organizationId,
      status: String((body as { status?: string }).status || ""),
      note: typeof (body as { note?: string }).note === "string" ? (body as { note?: string }).note?.trim() : "",
    })

    if (!result.ok) {
      if (result.code === "BAD_STATUS") return ApiErrors.BAD_REQUEST("Invalid withdrawal status")
      if (result.code === "NOT_FOUND") return ApiErrors.NOT_FOUND("Withdrawal request")
      if (result.code === "FORBIDDEN") return ApiErrors.FORBIDDEN()
      if (result.code === "INVALID_TRANSITION") return ApiErrors.BAD_REQUEST(`Invalid transition: ${result.from} -> ${result.to}`)
      if (result.code === "INSUFFICIENT_EARNINGS") return ApiErrors.BAD_REQUEST("This request exceeds the seller's currently available completed-order profit.")
      if (result.code === "CONFLICT") return ApiErrors.BAD_REQUEST("Withdrawal request status changed by another reviewer. Refresh and retry.")
      return ApiErrors.BAD_REQUEST("Unable to update withdrawal request")
    }

    return apiSuccess({
      withdrawal: result.withdrawal,
      idempotent: result.idempotent,
    })
  } catch (error) {
    logApiError("[DASHBOARD_WITHDRAWALS_PATCH]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
