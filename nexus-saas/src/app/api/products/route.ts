import { requireAuthAndOrg, requireOrgManager, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { requireActiveSubscription } from "@/lib/subscription-access"
import { getSubscriberStorefrontPrices, mapStorefrontPrices, upsertSubscriberStorefrontPrice } from "@/lib/storefront-pricing"
import { createProductSchema, pricingValidationError } from "@/lib/product-input"

export async function POST(req: Request) {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) {
      return authResult
    }

    let body: unknown
    try { body = await req.json() } catch { return ApiErrors.BAD_REQUEST("Request body must be valid JSON") }
    const validation = createProductSchema.safeParse(body)

    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors
      return ApiErrors.VALIDATION_ERROR(errors)
    }

    const { name, description, price, basePrice, storefrontPrice, stock, imageUrl, provider, bundleType, category, serviceForm, active } = validation.data
    const pricingError = pricingValidationError({
      basePrice: basePrice ?? price,
      storefrontPrice: storefrontPrice ?? price,
    })
    if (pricingError) return ApiErrors.BAD_REQUEST(pricingError)
    const organizationId = authResult.user.organizationId!
    const subscriptionError = await requireActiveSubscription(organizationId)
    if (subscriptionError) return subscriptionError

    const subscription = await db.subscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    })

    const productCount = await db.product.count({ where: { organizationId } })
    const maxProducts = subscription?.plan.maxProducts ?? 100
    if (productCount >= maxProducts) {
      return ApiErrors.BAD_REQUEST(`Plan product limit reached (${maxProducts}).`)
    }

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
          serviceForm: serviceForm || null,
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

      await upsertSubscriberStorefrontPrice({
        productId: product.id,
        organizationId,
        price: storefrontPrice ?? price,
      }, tx)

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

    const storefrontPriceMap = mapStorefrontPrices(await getSubscriberStorefrontPrices(organizationId))

    const response = products.map((p) => ({
      ...p,
      basePrice: p.basePrices?.[0]?.price ?? p.price,
      storefrontPrice: storefrontPriceMap.get(p.id) ?? p.price,
      hasBasePrice: p.basePrices.length > 0,
      hasStorefrontPrice: storefrontPriceMap.has(p.id),
    }))

    return apiSuccess(response)
  } catch (error) {
    logApiError("[PRODUCTS_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
