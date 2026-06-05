import { requireAuthAndOrg, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors } from "@/lib/api-response"
import { db } from "@/lib/db"
import { resolveResellerBuyPrice } from "@/lib/reseller-pricing"
import { requireActiveSubscription } from "@/lib/subscription-access"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const authResult = await requireAuthAndOrg()
    if (isAuthError(authResult)) {
      return authResult
    }

    const organizationId = authResult.user.organizationId!
    const subscriptionError = await requireActiveSubscription(organizationId)
    if (subscriptionError) return subscriptionError

    const actorUser = await db.user.findUnique({
      where: { id: authResult.user.id },
      select: { id: true, role: true, agentId: true, parentAgentId: true },
    })

    const actorAgentId = actorUser?.agentId ?? actorUser?.parentAgentId ?? null
    const actorResellerId = actorUser?.role === "RESELLER" ? actorUser.id : null

    const assignedProfile = await db.userPricingProfileAssignment.findFirst({
      where: { organizationId, userId: authResult.user.id },
      select: { pricingProfileId: true, strictPricing: true },
    })

    const url = new URL(req.url)
    const networkId = url.searchParams.get("networkId") // provider name like MTN, AIRTELTIGO

    if (!networkId) {
      return ApiErrors.BAD_REQUEST("networkId is required")
    }

    // Get all active bundles for this network/provider
    const bundles = await db.product.findMany({
      where: {
        organizationId,
        provider: networkId,
        active: true,
        category: "DATA_BUNDLE",
      },
      include: {
        agentPrices: {
          where: {
            organizationId,
            ...(actorAgentId ? { agentId: actorAgentId } : {}),
          },
          select: {
            price: true,
          },
        },
        resellerPrices: {
          where: {
            organizationId,
            ...(actorResellerId ? { resellerId: actorResellerId } : { resellerId: "" }),
          },
          select: {
            price: true,
          },
        },
        basePrices: {
          where: {
            organizationId,
          },
          select: {
            price: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    })

    const profilePriceMap = new Map<string, number>()
    if (assignedProfile) {
      const profileItems = await db.pricingProfileItem.findMany({
        where: {
          pricingProfileId: assignedProfile.pricingProfileId,
          productId: { in: bundles.map((b) => b.id) },
        },
        select: { productId: true, price: true },
      })
      for (const item of profileItems) {
        profilePriceMap.set(item.productId, item.price)
      }
    }

    // Map to include effectivePrice (reseller override > assigned profile > agent override > base price > product price)
    const bundlesWithPricing = bundles
      .filter((bundle) => !assignedProfile?.strictPricing || profilePriceMap.has(bundle.id))
      .map((bundle) => {
        let effectivePrice = bundle.price
        if (bundle.basePrices.length > 0) {
          effectivePrice = bundle.basePrices[0].price
        }
        if (bundle.agentPrices.length > 0) {
          effectivePrice = bundle.agentPrices[0].price
        }

        if (actorResellerId) {
          const resellerBuyPrice = resolveResellerBuyPrice({
            overridePrice: bundle.resellerPrices[0]?.price,
            profilePrice: profilePriceMap.get(bundle.id),
            parentCost: effectivePrice,
            strictPricing: assignedProfile?.strictPricing,
          })
          if (resellerBuyPrice !== null) effectivePrice = resellerBuyPrice
        } else if (profilePriceMap.has(bundle.id)) {
          effectivePrice = profilePriceMap.get(bundle.id) as number
        }

        return {
          id: bundle.id,
          name: bundle.name,
          price: bundle.price,
          provider: bundle.provider,
          effectivePrice,
        }
      })

    return apiSuccess(bundlesWithPricing)
  } catch (error) {
    console.error("[BUNDLES_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
