import { requireAuth, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors } from "@/lib/api-response"
import { db } from "@/lib/db"
import { requireActiveSubscription } from "@/lib/subscription-access"
import { getResellerPricingProfileContext, resolveResellerBuyPrice } from "@/lib/reseller-pricing"
import { getResellerStorefrontPrices, mapStorefrontPrices, upsertResellerStorefrontPrice } from "@/lib/storefront-pricing"
import { z } from "zod"

const upsertSchema = z.object({
  productId: z.string().min(1),
  price: z.number().nonnegative(),
})

export async function GET() {
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) return authResult
    const { user } = authResult

    if (!user.organizationId) return ApiErrors.BAD_REQUEST("User not linked to organization")

    const subscriptionError = await requireActiveSubscription(user.organizationId)
    if (subscriptionError) return subscriptionError

    const reseller = await db.user.findFirst({
      where: { id: user.id, organizationId: user.organizationId, role: "RESELLER", active: true },
      select: { id: true, parentAgentId: true },
    })
    if (!reseller?.parentAgentId) return ApiErrors.BAD_REQUEST("Reseller profile not linked to an agent.")

    const products = await db.product.findMany({
      where: { organizationId: user.organizationId, active: true },
      include: {
        agentPrices: { where: { agentId: reseller.parentAgentId, organizationId: user.organizationId }, select: { price: true } },
        resellerPrices: { where: { resellerId: reseller.id, organizationId: user.organizationId }, select: { price: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    const [storefrontPrices, pricingProfile] = await Promise.all([
      getResellerStorefrontPrices(reseller.id, user.organizationId),
      getResellerPricingProfileContext(user.organizationId, reseller.id),
    ])

    const storefrontPriceMap = mapStorefrontPrices(storefrontPrices)
    const payload = products.flatMap((product) => {
      const parentCost = product.agentPrices?.[0]?.price ?? product.price
      const buyPrice = resolveResellerBuyPrice({
        overridePrice: product.resellerPrices?.[0]?.price,
        profilePrice: pricingProfile.profilePriceMap.get(product.id),
        parentCost,
        strictPricing: pricingProfile.strictPricing,
      })

      if (buyPrice === null) return []

      const storefrontPrice = storefrontPriceMap.get(product.id) ?? buyPrice
      return [{
        id: product.id,
        name: product.name,
        provider: product.provider,
        category: product.category,
        parentCost,
        buyPrice,
        storefrontPrice,
        profit: Math.max(storefrontPrice - buyPrice, 0),
      }]
    })

    return apiSuccess({
      resellerId: reseller.id,
      pricingProfileId: pricingProfile.pricingProfileId,
      strictPricing: pricingProfile.strictPricing,
      products: payload,
    })
  } catch (error) {
    console.error("[RESELLER_STOREFRONT_PRICES_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function POST(req: Request) {
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) return authResult
    const { user } = authResult

    if (!user.organizationId) return ApiErrors.BAD_REQUEST("User not linked to organization")

    const body = await req.json()
    const parsed = upsertSchema.safeParse(body)
    if (!parsed.success) return ApiErrors.VALIDATION_ERROR(parsed.error.flatten().fieldErrors)

    const reseller = await db.user.findFirst({
      where: { id: user.id, organizationId: user.organizationId, role: "RESELLER", active: true },
      select: { id: true, parentAgentId: true },
    })
    if (!reseller?.parentAgentId) return ApiErrors.BAD_REQUEST("Reseller profile not linked to an agent.")

    const product = await db.product.findFirst({
      where: { id: parsed.data.productId, organizationId: user.organizationId, active: true },
      include: {
        agentPrices: { where: { agentId: reseller.parentAgentId, organizationId: user.organizationId }, select: { price: true } },
        resellerPrices: { where: { resellerId: reseller.id, organizationId: user.organizationId }, select: { price: true } },
      },
    })
    if (!product) return ApiErrors.NOT_FOUND("Product")

    const pricingProfile = await getResellerPricingProfileContext(user.organizationId, reseller.id)
    const parentCost = product.agentPrices?.[0]?.price ?? product.price
    const buyPrice = resolveResellerBuyPrice({
      overridePrice: product.resellerPrices?.[0]?.price,
      profilePrice: pricingProfile.profilePriceMap.get(product.id),
      parentCost,
      strictPricing: pricingProfile.strictPricing,
    })

    if (buyPrice === null) {
      return ApiErrors.BAD_REQUEST("This product is not available on your assigned pricing profile.")
    }

    if (parsed.data.price < buyPrice) {
      return ApiErrors.BAD_REQUEST(`Storefront price cannot be below your buy price (${buyPrice}).`)
    }

    const record = await upsertResellerStorefrontPrice({
      resellerId: reseller.id,
      productId: product.id,
      organizationId: user.organizationId,
      price: parsed.data.price,
    })

    return apiSuccess(record, "Storefront price saved", 201)
  } catch (error) {
    console.error("[RESELLER_STOREFRONT_PRICES_POST]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
