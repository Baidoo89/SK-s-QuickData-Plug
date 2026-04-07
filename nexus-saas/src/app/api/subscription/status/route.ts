import { requireAuthAndOrg, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"

export async function GET() {
  try {
    const authResult = await requireAuthAndOrg()
    if (isAuthError(authResult)) {
      return authResult
    }

    const org = await db.organization.findUnique({
      where: { id: authResult.user.organizationId! },
      include: {
        subscription: {
          include: { plan: true },
        },
      },
    })

    if (!org) {
      return ApiErrors.NOT_FOUND("Organization")
    }

    const subscription = org.subscription
    if (!subscription) {
      return apiSuccess({ status: "NONE" })
    }

    const now = new Date()
    const isActive =
      subscription.status === "ACTIVE" && (!subscription.nextBillingAt || subscription.nextBillingAt > now)

    return apiSuccess({
      status: isActive ? "ACTIVE" : "EXPIRED",
      subscription,
    })
  } catch (error) {
    logApiError("[SUBSCRIPTION_STATUS]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
