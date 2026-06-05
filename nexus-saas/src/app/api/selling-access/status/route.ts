import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { requireAuthAndOrg, isAuthError } from "@/lib/auth-guard"
import { getOrganizationSellingAccess } from "@/lib/selling-access"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const authResult = await requireAuthAndOrg()
    if (isAuthError(authResult)) {
      return authResult
    }

    const access = await getOrganizationSellingAccess(authResult.user.organizationId!)
    return apiSuccess(access)
  } catch (error) {
    logApiError("[SELLING_ACCESS_STATUS]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
