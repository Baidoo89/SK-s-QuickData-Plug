import { requireAuth, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors } from "@/lib/api-response"
import { db } from "@/lib/db"
import { requireActiveSubscription } from "@/lib/subscription-access"
import { getAgentStorefrontPrices, mapStorefrontPrices, upsertAgentStorefrontPrice } from "@/lib/storefront-pricing"
import { z } from "zod"

const upsertSchema = z.object({
  productId: z.string().min(1),
  price: z.number().nonnegative(),
})

async function resolveAgentContext(userId: string, organizationId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { agentId: true },
  })

  if (user?.agentId) return user.agentId

  const agent = await db.agent.findFirst({
    where: { organizationId, user: { id: userId } },
    select: { id: true },
  })

  return agent?.id ?? null
}

export async function GET() {
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) return authResult
    const { user } = authResult

    if (!user.organizationId) return ApiErrors.BAD_REQUEST("User not linked to organization")

    const subscriptionError = await requireActiveSubscription(user.organizationId)
    if (subscriptionError) return subscriptionError

    const agentId = await resolveAgentContext(user.id, user.organizationId)
    if (!agentId) return ApiErrors.BAD_REQUEST("Agent profile not linked to this account.")

    const products = await db.product.findMany({
      where: { organizationId: user.organizationId, active: true },
      include: {
        basePrices: { where: { organizationId: user.organizationId }, select: { price: true } },
        agentPrices: { where: { agentId, organizationId: user.organizationId }, select: { price: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    const storefrontPriceMap = mapStorefrontPrices(await getAgentStorefrontPrices(agentId, user.organizationId))
    const payload = products.map((product) => {
      const baseCost = product.basePrices?.[0]?.price ?? product.price
      const buyPrice = product.agentPrices?.[0]?.price ?? product.price
      const storefrontPrice = storefrontPriceMap.get(product.id) ?? buyPrice
      return {
        id: product.id,
        name: product.name,
        provider: product.provider,
        category: product.category,
        baseCost,
        buyPrice,
        storefrontPrice,
        profit: Math.max(storefrontPrice - buyPrice, 0),
      }
    })

    return apiSuccess({ agentId, products: payload })
  } catch (error) {
    console.error("[AGENT_STOREFRONT_PRICES_GET]", error)
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

    const agentId = await resolveAgentContext(user.id, user.organizationId)
    if (!agentId) return ApiErrors.BAD_REQUEST("Agent profile not linked to this account.")

    const product = await db.product.findFirst({
      where: { id: parsed.data.productId, organizationId: user.organizationId, active: true },
      include: {
        agentPrices: { where: { agentId, organizationId: user.organizationId }, select: { price: true } },
      },
    })
    if (!product) return ApiErrors.NOT_FOUND("Product")

    const buyPrice = product.agentPrices?.[0]?.price ?? product.price
    if (parsed.data.price < buyPrice) {
      return ApiErrors.BAD_REQUEST(`Storefront price cannot be below your buy price (${buyPrice}).`)
    }

    const record = await upsertAgentStorefrontPrice({
      agentId,
      productId: product.id,
      organizationId: user.organizationId,
      price: parsed.data.price,
    })

    return apiSuccess(record, "Storefront price saved", 201)
  } catch (error) {
    console.error("[AGENT_STOREFRONT_PRICES_POST]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
