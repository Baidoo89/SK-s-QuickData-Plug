import { ApiErrors, apiSuccess } from "@/lib/api-response"
import { db } from "@/lib/db"
import { isSubscriptionActive } from "@/lib/subscription-access"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const tenant = (searchParams.get("tenant") || "").trim().toLowerCase()

    if (!tenant) {
      return ApiErrors.BAD_REQUEST("Tenant invite code is required")
    }

    const organization = await db.organization.findFirst({
      where: {
        slug: tenant,
        active: true,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        subscription: true,
      },
    })

    if (!organization) {
      return ApiErrors.NOT_FOUND("Valid subscriber invite not found")
    }

    if (!isSubscriptionActive(organization.subscription)) {
      return ApiErrors.SUBSCRIPTION_REQUIRED()
    }

    return apiSuccess({
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
    })
  } catch (error) {
    console.error("[REGISTER_AGENT_CONTEXT_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
