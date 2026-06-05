import { requireRole, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { listAgentWithdrawalRequests, normalizeWithdrawalLimit } from "@/lib/withdrawal-review"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const authResult = await requireRole("SUBSCRIBER")
    if (isAuthError(authResult)) {
      return authResult
    }

    const actor = authResult.user
    if (!actor.organizationId) {
      return ApiErrors.INVALID_ORGANIZATION()
    }

    const url = new URL(req.url)
    const data = await listAgentWithdrawalRequests({
      organizationId: actor.organizationId,
      status: url.searchParams.get("status")?.trim(),
      q: url.searchParams.get("q")?.trim(),
      take: normalizeWithdrawalLimit(url.searchParams.get("limit")),
    })

    return apiSuccess(data)
  } catch (error) {
    logApiError("[DASHBOARD_WITHDRAWALS_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
