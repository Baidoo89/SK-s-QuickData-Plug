import { db } from "@/lib/db"
import { apiSuccess, ApiErrors } from "@/lib/api-response"
import { isSubscriptionActive } from "@/lib/subscription-access"
import { getResellerPricingProfileContext, resolveResellerBuyPrice } from "@/lib/reseller-pricing"
import { getResellerStorefrontPrices, mapStorefrontPrices } from "@/lib/storefront-pricing"

interface Params {
  params: {
    tenantSlug: string
    resellerId: string
  }
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { tenantSlug, resellerId } = params

    const organization = await db.organization.findUnique({
      where: { slug: tenantSlug },
      include: { subscription: true },
    })

    if (!organization) {
      return ApiErrors.NOT_FOUND("Tenant")
    }

    if (!organization.active) {
      return ApiErrors.FORBIDDEN()
    }

    if (!isSubscriptionActive(organization.subscription)) {
      return ApiErrors.SUBSCRIPTION_REQUIRED()
    }

    const reseller = await db.user.findFirst({
      where: {
        id: resellerId,
        organizationId: organization.id,
        role: "RESELLER",
        active: true,
        signupStatus: "APPROVED",
      },
      select: {
        id: true,
        name: true,
        email: true,
        parentAgentId: true,
      },
    })

    if (!reseller?.parentAgentId) {
      return ApiErrors.NOT_FOUND("Reseller")
    }

    const parentAgent = await db.agent.findFirst({
      where: {
        id: reseller.parentAgentId,
        organizationId: organization.id,
        active: true,
      },
      select: {
        id: true,
        name: true,
      },
    })

    if (!parentAgent) {
      return ApiErrors.NOT_FOUND("Parent agent")
    }

    const products = await db.product.findMany({
      where: { organizationId: organization.id, active: true },
      include: {
        basePrices: {
          where: { organizationId: organization.id },
          select: { price: true },
        },
        agentPrices: {
          where: { agentId: parentAgent.id, organizationId: organization.id },
          select: { price: true },
        },
        resellerPrices: {
          where: { resellerId: reseller.id, organizationId: organization.id },
          select: { price: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    const storefrontPriceMap = mapStorefrontPrices(await getResellerStorefrontPrices(reseller.id, organization.id))
    const pricingProfile = await getResellerPricingProfileContext(organization.id, reseller.id)

    const payload = products.flatMap((product: any) => {
      const basePrice = product.basePrices?.[0]?.price ?? product.price
      const parentCost = product.agentPrices?.[0]?.price ?? product.price
      const resellerPrice = product.resellerPrices?.[0]?.price
      const resellerBuyPrice = resolveResellerBuyPrice({
        overridePrice: resellerPrice,
        profilePrice: pricingProfile.profilePriceMap.get(product.id),
        parentCost,
        strictPricing: pricingProfile.strictPricing,
      })

      if (resellerBuyPrice === null) return []

      const effectivePrice = storefrontPriceMap.get(product.id) ?? resellerBuyPrice

      return [{
        id: product.id,
        name: product.name,
        description: product.description,
        provider: product.provider,
        bundleType: product.bundleType,
        category: product.category,
        serviceForm: product.serviceForm,
        stock: product.stock,
        basePrice,
        parentCost,
        resellerBuyPrice,
        price: effectivePrice,
      }]
    })

    return apiSuccess({
      tenant: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      agent: {
        id: parentAgent.id,
        name: parentAgent.name,
      },
      reseller: {
        id: reseller.id,
        name: reseller.name,
        email: reseller.email,
      },
      products: payload,
    })
  } catch (error) {
    console.error("[SHOP_RESELLER_PRODUCTS]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
