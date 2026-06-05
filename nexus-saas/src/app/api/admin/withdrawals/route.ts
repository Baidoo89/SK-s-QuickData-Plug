import { requireAdmin, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { listAgentWithdrawalRequests, normalizeWithdrawalLimit } from "@/lib/withdrawal-review"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const authResult = await requireAdmin()
    if (isAuthError(authResult)) {
      return authResult
    }

    const url = new URL(req.url)
    const status = url.searchParams.get("status")?.trim()
    const q = url.searchParams.get("q")?.trim()
    const organizationId = url.searchParams.get("organizationId")?.trim() || undefined

    const data = await listAgentWithdrawalRequests({
      organizationId,
      status,
      q,
      take: normalizeWithdrawalLimit(url.searchParams.get("limit")),
    })

    return apiSuccess(data)
  } catch (error) {
    logApiError("[ADMIN_WITHDRAWALS_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
