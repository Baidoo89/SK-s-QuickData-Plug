import { auth } from "@/auth"
import { db } from "@/lib/db"
import { apiSuccess, ApiErrors } from "@/lib/api-response"
import { isSubscriptionActive } from "@/lib/subscription-access"
import { getOrganizationSellingAccess } from "@/lib/selling-access"

export const dynamic = "force-dynamic"

export async function GET() {
  const session = await auth()
  if (!session?.user?.email) return ApiErrors.UNAUTHORIZED()

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      role: true,
      organizationId: true,
      organization: {
        select: {
          subscription: {
            select: { status: true, nextBillingAt: true },
          },
        },
      },
    },
  })

  if (!user) return ApiErrors.UNAUTHORIZED()

  let path = "/login"
  let reason = "default"

  if (user.role === "SUPERADMIN") {
    path = "/admin"
    reason = "superadmin"
  } else if (user.role === "SUBSCRIBER") {
    if (isSubscriptionActive(user.organization?.subscription)) {
      const sellingAccess = user.organizationId
        ? await getOrganizationSellingAccess(user.organizationId)
        : null

      if (sellingAccess?.canSell) {
        path = "/dashboard"
        reason = "subscriber_ready"
      } else {
        path = "/dashboard/setup"
        reason = "subscriber_needs_setup"
      }
    } else {
      path = "/dashboard/subscription?welcome=1"
      reason = "subscriber_needs_subscription"
    }
  } else if (user.role === "AGENT") {
    path = "/agent"
    reason = "agent"
  } else if (user.role === "RESELLER") {
    path = "/reseller"
    reason = "reseller"
  }

  return apiSuccess({ path, reason })
}
