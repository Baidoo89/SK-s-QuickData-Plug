import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { apiSuccess, ApiErrors } from "@/lib/api-response"

interface Params {
  params: {
    tenantSlug: string
  }
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { tenantSlug } = params

    const organization = await db.organization.findUnique({
      where: { slug: tenantSlug },
      // Subscriptions are ignored for now; only org.active controls availability.
      include: { subscription: true },
    })

    if (!organization) {
      return ApiErrors.NOT_FOUND("Store")
    }

    // For now, ignore subscription status and only respect organization.active.
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
      },
      orderBy: { createdAt: "desc" },
    })

    const payload = products.map((product: any) => {
      const basePrice = product.basePrices?.[0]?.price ?? product.price
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        provider: product.provider,
        bundleType: product.bundleType,
        category: product.category,
        stock: product.stock,
        price: basePrice,
      }
    })

    return apiSuccess({
      tenant: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      products: payload,
    })
  } catch (error) {
    console.error("[SHOP_PRODUCTS]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
