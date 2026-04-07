import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuthAndOrg, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors } from "@/lib/api-response"

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const authResult = await requireAuthAndOrg()
    if (isAuthError(authResult)) return authResult
    const organizationId = authResult.user.organizationId!

    const body = await req.json()
    const { name, description, price, basePrice, stock, imageUrl, provider, bundleType, category, active } = body

    const existing = await db.product.findFirst({
      where: { id: params.id, organizationId },
    })

    if (!existing) {
      return ApiErrors.NOT_FOUND("Product not found")
    }

    const numericPrice = price !== undefined ? parseFloat(price) : existing.price
    const numericBasePrice = basePrice !== undefined ? parseFloat(basePrice) : existing.price

    const updated = await db.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id: params.id },
        data: {
          name: name ?? existing.name,
          description: description ?? existing.description,
          price: numericPrice,
          stock: stock !== undefined ? parseInt(stock) : existing.stock,
          imageUrl: imageUrl ?? existing.imageUrl,
          provider: provider ?? existing.provider,
          bundleType: bundleType ?? existing.bundleType,
          category: category ?? existing.category,
        },
      })

      // Maintain basePrice using dynamic client to avoid type mismatch until prisma client is regenerated
      await tx.basePrice.upsert({
        where: {
          productId_organizationId: { productId: product.id, organizationId: organizationId },
        },
        create: {
          price: numericBasePrice,
          productId: product.id,
          organizationId: organizationId,
        },
        update: { price: numericBasePrice },
      })

      return product
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("[PRODUCT_UPDATE]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const authResult = await requireAuthAndOrg()
    if (isAuthError(authResult)) return authResult
    const organizationId = authResult.user.organizationId!

    const existing = await db.product.findFirst({
      where: { id: params.id, organizationId },
    })

    if (!existing) {
      return ApiErrors.NOT_FOUND("Product")
    }

    await db.$transaction(async (tx) => {
      await tx.agentPrice.deleteMany({ where: { productId: existing.id, organizationId } })
      await tx.basePrice.deleteMany({ where: { productId: existing.id, organizationId } })
      await tx.customPrice.deleteMany({ where: { productId: existing.id, organizationId } })
      await tx.orderItem.deleteMany({ where: { productId: existing.id } })
      await tx.product.delete({ where: { id: existing.id } })
    })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error("[PRODUCT_DELETE]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
