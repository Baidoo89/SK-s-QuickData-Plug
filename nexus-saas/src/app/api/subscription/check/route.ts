import { NextResponse } from "next/server"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { requireAuthAndOrg, isAuthError } from "@/lib/auth-guard"
import { db } from "@/lib/db"
import { isSubscriptionActive } from "@/lib/subscription-access"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const authResult = await requireAuthAndOrg()
    if (isAuthError(authResult)) {
      return authResult
    }

    const subscription = await db.subscription.findUnique({
      where: { organizationId: authResult.user.organizationId! },
      include: { plan: true },
    })

    return apiSuccess({
      ok: isSubscriptionActive(subscription),
      subscription,
    })
  } catch (error) {
    logApiError("[SUBSCRIPTION_CHECK]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

