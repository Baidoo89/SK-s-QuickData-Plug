import { requireAuthAndOrg, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"

export async function GET() {
  try {
    const authResult = await requireAuthAndOrg()
    if (isAuthError(authResult)) {
      return authResult
    }

    const tenant = await db.organization.findUnique({
      where: { id: authResult.user.organizationId! },
      include: {
        subscription: {
          include: { plan: true },
        },
      },
    })

    if (!tenant) {
      return ApiErrors.NOT_FOUND("Tenant")
    }

    return apiSuccess({ tenant })
  } catch (error) {
    logApiError("[TENANT_CURRENT]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
