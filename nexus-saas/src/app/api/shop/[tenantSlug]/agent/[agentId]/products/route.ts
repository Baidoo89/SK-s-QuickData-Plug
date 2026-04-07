import { db } from "@/lib/db"
import { apiSuccess, ApiErrors } from "@/lib/api-response"

interface Params {
  params: {
    tenantSlug: string
    agentId: string
  }
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { tenantSlug, agentId } = params

    const organization = await db.organization.findUnique({
      where: { slug: tenantSlug },
      include: {
        // Subscriptions are ignored for now; include kept for future use.
        subscription: true,
        agents: true,
      },
    })

    if (!organization) {
      return ApiErrors.NOT_FOUND("Tenant")
    }

    const agent = organization.agents.find((a) => a.id === agentId && a.active)
    if (!agent) {
      return ApiErrors.NOT_FOUND("Agent")
    }

    // For now, treat the shop as active based solely on organization.active.
    if (!organization.active) {
      return ApiErrors.FORBIDDEN()
    }

    const products = await db.product.findMany({
      where: { organizationId: organization.id, active: true },
      include: {
        basePrices: {
          where: { organizationId: organization.id },
          select: { price: true },
        },
        agentPrices: {
          where: { agentId },
          select: { price: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    const payload = products.map((product: any) => {
      const basePrice = product.basePrices?.[0]?.price ?? product.price
      const agentPrice = product.agentPrices?.[0]?.price
      const effectivePrice = agentPrice ?? basePrice

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        provider: product.provider,
        bundleType: product.bundleType,
        category: product.category,
        stock: product.stock,
        basePrice,
        price: effectivePrice,
      }
    })

    return apiSuccess({
      tenant: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      agent: {
        id: agent.id,
        name: agent.name,
      },
      products: payload,
    })
  } catch (error) {
    console.error("[SHOP_AGENT_PRODUCTS]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
