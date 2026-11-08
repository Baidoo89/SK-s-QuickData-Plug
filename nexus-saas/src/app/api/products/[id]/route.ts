import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireOrgManager, isAuthError } from "@/lib/auth-guard"
import { ApiErrors, logApiError } from "@/lib/api-response"
import { upsertSubscriberStorefrontPrice } from "@/lib/storefront-pricing"
import { updateProductSchema } from "@/lib/product-input"

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) return authResult
    const organizationId = authResult.user.organizationId!

    let body: unknown
    try { body = await req.json() } catch { return ApiErrors.BAD_REQUEST("Request body must be valid JSON") }
    const validation = updateProductSchema.safeParse(body)
    if (!validation.success) return ApiErrors.VALIDATION_ERROR(validation.error.flatten().fieldErrors)
    const { basePrice, storefrontPrice, ...productFields } = validation.data

    const updated = await db.$transaction(async tx => {
      const existing = await tx.product.findFirst({
        where: { id: params.id, organizationId },
        select: { id: true },
      })
      if (!existing) return null

      const product = await tx.product.update({
        where: { id: existing.id, organizationId },
        data: {
          ...productFields,
          serviceForm: productFields.serviceForm === undefined ? undefined : productFields.serviceForm || null,
        },
      })
      if (basePrice !== undefined) {
        await tx.basePrice.upsert({
          where: { productId_organizationId: { productId: product.id, organizationId } },
          create: { price: basePrice, productId: product.id, organizationId },
          update: { price: basePrice },
        })
      }
      if (storefrontPrice !== undefined) {
        await upsertSubscriberStorefrontPrice({ productId: product.id, organizationId, price: storefrontPrice }, tx)
      }
      return product
    })

    if (!updated) return ApiErrors.NOT_FOUND("Product")
    // Keep the existing successful PUT response shape for current clients.
    return NextResponse.json(updated)
  } catch (error) {
    logApiError("[PRODUCT_UPDATE]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) return authResult
    const organizationId = authResult.user.organizationId!

    const outcome = await db.$transaction(async tx => {
      const existing = await tx.product.findFirst({
        where: { id: params.id, organizationId },
        select: { id: true, _count: { select: { orderItems: true } } },
      })
      if (!existing) return "not_found"
      // Preserve past purchases. The owner can hide the bundle instead.
      if (existing._count.orderItems > 0) return "has_orders"

      await tx.$executeRaw`DELETE FROM "SubscriberStorefrontPrice" WHERE "productId" = ${existing.id} AND "organizationId" = ${organizationId}`
      await tx.$executeRaw`DELETE FROM "AgentStorefrontPrice" WHERE "productId" = ${existing.id} AND "organizationId" = ${organizationId}`
      await tx.$executeRaw`DELETE FROM "ResellerStorefrontPrice" WHERE "productId" = ${existing.id} AND "organizationId" = ${organizationId}`
      await tx.agentPrice.deleteMany({ where: { productId: existing.id, organizationId } })
      await tx.basePrice.deleteMany({ where: { productId: existing.id, organizationId } })
      await tx.customPrice.deleteMany({ where: { productId: existing.id, organizationId } })
      await tx.product.delete({ where: { id: existing.id, organizationId } })
      return "deleted"
    })

    if (outcome === "not_found") return ApiErrors.NOT_FOUND("Product")
    if (outcome === "has_orders") return ApiErrors.CONFLICT("This product has order history. Hide it from sale instead of deleting it.")
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    // A purchase created during deletion must also keep its product/history.
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2003") {
      return ApiErrors.CONFLICT("This product is still in use. Hide it from sale instead of deleting it.")
    }
    logApiError("[PRODUCT_DELETE]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
