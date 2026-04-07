import { requireOrgManager, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { z } from "zod"

const updateBasePriceSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  price: z.number().min(0, "Price must be >= 0"),
})

export async function GET() {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) {
      return authResult
    }

    const organizationId = authResult.user.organizationId!

    const products = await db.product.findMany({
      where: { organizationId },
      include: {
        basePrices: {
          where: { organizationId },
          select: { price: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    const response = products.map((p: any) => ({
      productId: p.id,
      name: p.name,
      provider: p.provider,
      defaultPrice: p.price,
      basePrice: p.basePrices?.[0]?.price ?? p.price,
    }))

    return apiSuccess(response)
  } catch (error) {
    logApiError("[PRICING_BASE_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function POST(req: Request) {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) {
      return authResult
    }

    const organizationId = authResult.user.organizationId!
    const body = await req.json()
    const validation = updateBasePriceSchema.safeParse(body)

    if (!validation.success) {
      return ApiErrors.VALIDATION_ERROR(validation.error.flatten().fieldErrors)
    }

    const { productId, price } = validation.data

    const product = await db.product.findFirst({
      where: { id: productId, organizationId },
    })

    if (!product) {
      return ApiErrors.NOT_FOUND("Product")
    }

    const record = await db.basePrice.upsert({
      where: {
        productId_organizationId: { productId, organizationId },
      },
      create: { productId, organizationId, price },
      update: { price },
    })

    return apiSuccess(record, "Base price updated", 201)
  } catch (error) {
    logApiError("[PRICING_BASE_POST]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
