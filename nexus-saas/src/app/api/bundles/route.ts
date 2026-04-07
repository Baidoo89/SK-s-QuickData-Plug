import { requireAuthAndOrg, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors } from "@/lib/api-response"
import { db } from "@/lib/db"

export async function GET(req: Request) {
  try {
    const authResult = await requireAuthAndOrg()
    if (isAuthError(authResult)) {
      return authResult
    }

    const organizationId = authResult.user.organizationId!
    const actorUser = await db.user.findUnique({
      where: { id: authResult.user.id },
      select: { id: true, role: true, agentId: true, parentAgentId: true },
    })

    const actorAgentId = actorUser?.agentId ?? actorUser?.parentAgentId ?? null
    const actorResellerId = actorUser?.role === "RESELLER" ? actorUser.id : null

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

    // Map to include effectivePrice (reseller override > agent override > base price > product price)
    const bundlesWithPricing = bundles.map((bundle) => {
      let effectivePrice = bundle.price
      if (bundle.basePrices.length > 0) {
        effectivePrice = bundle.basePrices[0].price
      }
      if (bundle.agentPrices.length > 0) {
        effectivePrice = bundle.agentPrices[0].price
      }
      if (bundle.resellerPrices.length > 0) {
        effectivePrice = bundle.resellerPrices[0].price
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
