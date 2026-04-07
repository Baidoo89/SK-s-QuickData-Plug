import { requireAuthAndOrg, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { z } from "zod"

const createProductSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  description: z.string().optional().default(""),
  price: z.number().min(0, "Price must be >= 0"),
  basePrice: z.number().min(0).optional(),
  stock: z.number().int().min(0).optional().default(0),
  imageUrl: z.string().url().optional().default(""),
  provider: z.string().optional().default("MTN"),
  bundleType: z.string().optional().default("DATA"),
  category: z.string().optional().default("DATA_BUNDLE"),
  active: z.boolean().optional().default(true),
})

export async function POST(req: Request) {
  try {
    const authResult = await requireAuthAndOrg()
    if (isAuthError(authResult)) {
      return authResult
    }

    const body = await req.json()
    const validation = createProductSchema.safeParse(body)

    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors
      return ApiErrors.VALIDATION_ERROR(errors)
    }

    const { name, description, price, basePrice, stock, imageUrl, provider, bundleType, category, active } = validation.data
    const organizationId = authResult.user.organizationId!

    const result = await db.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name,
          description,
          price,
          stock,
          imageUrl,
          provider,
          bundleType,
          category,
          active,
          organizationId,
        },
      })

      // Create base price
      const basePriceValue = basePrice ?? price
      await tx.basePrice.upsert({
        where: {
          productId_organizationId: { productId: product.id, organizationId },
        },
        create: {
          price: basePriceValue,
          productId: product.id,
          organizationId,
        },
        update: { price: basePriceValue },
      })

      return product
    })

    return apiSuccess(result, "Product created successfully", 201)
  } catch (error) {
    logApiError("[PRODUCTS_POST]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function GET(req: Request) {
  try {
    const authResult = await requireAuthAndOrg()
    if (isAuthError(authResult)) {
      return authResult
    }

    const organizationId = authResult.user.organizationId!
    const { searchParams } = new URL(req.url)
    const activeOnly = searchParams.get("active") === "true"

    const products = await db.product.findMany({
      where: {
        organizationId,
        ...(activeOnly && { active: true }),
      },
      include: {
        basePrices: {
          where: { organizationId },
          select: { price: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    const response = products.map((p) => ({
      ...p,
      basePrice: p.basePrices?.[0]?.price ?? p.price,
    }))

    return apiSuccess(response)
  } catch (error) {
    logApiError("[PRODUCTS_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
