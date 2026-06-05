import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors } from "@/lib/api-response"
import { getResellerPricingProfileContext, resolveResellerBuyPrice } from "@/lib/reseller-pricing"
import { z } from "zod"

const createPriceSchema = z.object({
  resellerId: z.string().min(1),
  productId: z.string().min(1),
  price: z.number().min(0),
})

export async function POST(req: Request) {
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) return authResult
    const { user: authUser } = authResult

    if (!authUser.organizationId) {
      return ApiErrors.BAD_REQUEST("User not linked to organization")
    }

    const organizationId = authUser.organizationId

    const fullUser = await db.user.findUnique({
      where: { id: authUser.id },
      select: { agentId: true },
    })

    let agentId = fullUser?.agentId ?? null
    if (!agentId) {
      const candidates = await db.agent.findMany({
        where: { organizationId },
        select: { id: true },
        take: 2,
      })

      if (candidates.length === 1) {
        agentId = candidates[0].id
        await db.user.update({ where: { id: authUser.id }, data: { agentId, role: "AGENT" } })
      } else {
        return ApiErrors.BAD_REQUEST("Agent profile not linked to this account. Ask admin to relink your agent login.")
      }
    }

    const body = await req.json()
    const parsed = createPriceSchema.safeParse(body)
    if (!parsed.success) return ApiErrors.VALIDATION_ERROR(parsed.error.flatten().fieldErrors)

    const { resellerId, productId, price } = parsed.data

    // Verify reseller exists in this organization
    const reseller = await db.user.findFirst({
      where: { id: resellerId, organizationId, role: "RESELLER", parentAgentId: agentId },
    })
    if (!reseller) {
      return ApiErrors.NOT_FOUND("Reseller not found")
    }

    const product = await db.product.findFirst({
      where: { id: productId, organizationId },
      include: {
        agentPrices: {
          where: { agentId, organizationId },
          select: { price: true },
        },
      },
    })
    if (!product) {
      return ApiErrors.NOT_FOUND("Product not found")
    }

    const parentCost = product.agentPrices?.[0]?.price ?? product.price
    if (price < parentCost) {
      return ApiErrors.BAD_REQUEST(`Reseller price cannot be below the parent agent cost (${parentCost}).`)
    }

    const result = await db.resellerPrice.upsert({
      where: { resellerId_productId: { resellerId, productId } },
      create: {
        price,
        resellerId,
        productId,
        organizationId,
      },
      update: { price },
    })

    return apiSuccess(result, "Price override saved", 201)
  } catch (error) {
    console.error("[RESELLER_PRICES_POST]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function GET(req: Request) {
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) return authResult
    const { user: authUser } = authResult

    if (!authUser.organizationId) {
      return ApiErrors.BAD_REQUEST("User not linked to organization")
    }

    const organizationId = authUser.organizationId

    const fullUser = await db.user.findUnique({
      where: { id: authUser.id },
      select: { agentId: true },
    })

    let agentId = fullUser?.agentId ?? null
    if (!agentId) {
      const candidates = await db.agent.findMany({
        where: { organizationId },
        select: { id: true },
        take: 2,
      })

      if (candidates.length === 1) {
        agentId = candidates[0].id
        await db.user.update({ where: { id: authUser.id }, data: { agentId, role: "AGENT" } })
      } else {
        return ApiErrors.BAD_REQUEST("Agent profile not linked to this account. Ask admin to relink your agent login.")
      }
    }

    const { searchParams } = new URL(req.url)
    const resellerId = searchParams.get("resellerId")

    if (!resellerId) {
      return ApiErrors.BAD_REQUEST("resellerId required")
    }

    // Verify reseller exists in this organization
    const reseller = await db.user.findFirst({
      where: {
        id: resellerId,
        organizationId,
        role: "RESELLER",
        parentAgentId: agentId,
      },
    })
    if (!reseller) {
      return ApiErrors.NOT_FOUND("Reseller not found")
    }

    const prices = await db.resellerPrice.findMany({
      where: { resellerId, organizationId },
      select: { id: true, resellerId: true, productId: true, price: true },
    })

    const [products, pricingProfile] = await Promise.all([
      db.product.findMany({
        where: { organizationId, active: true },
        include: {
          basePrices: {
            where: { organizationId },
            select: { price: true },
          },
          agentPrices: {
            where: { agentId, organizationId },
            select: { price: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      getResellerPricingProfileContext(organizationId, resellerId),
    ])

    const overrideMap = new Map(prices.map((price) => [price.productId, price.price]))

    const productPricing = products.map((product) => {
      const basePrice = product.basePrices?.[0]?.price ?? product.price
      const parentCost = product.agentPrices?.[0]?.price ?? product.price
      const profilePrice = pricingProfile.profilePriceMap.get(product.id)
      const effectiveDefaultPrice = resolveResellerBuyPrice({
        overridePrice: overrideMap.get(product.id),
        profilePrice,
        parentCost,
        strictPricing: pricingProfile.strictPricing,
      })
      return {
        id: product.id,
        name: product.name,
        provider: product.provider,
        category: product.category,
        price: effectiveDefaultPrice ?? parentCost,
        basePrice,
        parentCost,
        profilePrice,
        effectiveDefaultPrice,
        blockedByStrictProfile: effectiveDefaultPrice === null,
      }
    })

    return apiSuccess({
      prices,
      products: productPricing,
      assignment: {
        pricingProfileId: pricingProfile.pricingProfileId,
        strictPricing: pricingProfile.strictPricing,
      },
    })
  } catch (error) {
    console.error("[RESELLER_PRICES_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
