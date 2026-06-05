import { requireAdmin, isAuthError } from "@/lib/auth-guard"
import { ApiErrors, logApiError } from "@/lib/api-response"

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const authResult = await requireAdmin()
    if (isAuthError(authResult)) {
      return authResult
    }

    return ApiErrors.FORBIDDEN()
  } catch (error) {
    logApiError("[ADMIN_WITHDRAWALS_PATCH]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
