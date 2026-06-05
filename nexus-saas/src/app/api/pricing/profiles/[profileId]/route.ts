import { z } from "zod"
import { db } from "@/lib/db"
import { apiSuccess, ApiErrors } from "@/lib/api-response"
import { requireOrgManager, isAuthError } from "@/lib/auth-guard"

const updateProfileSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  tag: z.string().max(50).nullable().optional(),
  targetRole: z.enum(["AGENT", "RESELLER", "BOTH"]).optional(),
  productId: z.string().optional(),
  price: z.number().min(0).optional(),
})

export async function GET(_: Request, { params }: { params: { profileId: string } }) {
  try {
    const auth = await requireOrgManager()
    if (isAuthError(auth)) return auth

    const organizationId = auth.user.organizationId!
    const profileId = params.profileId

    const profile = await db.pricingProfile.findFirst({
      where: { id: profileId, organizationId, ownerAgentId: null },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                provider: true,
                price: true,
                active: true,
                category: true,
                basePrices: {
                  where: { organizationId },
                  select: { price: true },
                  take: 1,
                },
              },
            },
          },
          orderBy: { product: { name: "asc" } },
        },
        _count: { select: { assignments: true } },
      },
    })

    if (!profile) return ApiErrors.NOT_FOUND("Pricing profile")

    const rows = profile.items
      .filter((item) => item.product.active)
      .map((item) => ({
        productId: item.productId,
        productName: item.product.name,
        network: item.product.provider,
        basePrice: item.product.basePrices[0]?.price ?? item.product.price,
        profilePrice: item.price,
      }))

    return apiSuccess({
      id: profile.id,
      name: profile.name,
      tag: profile.tag,
      targetRole: profile.targetRole,
      assignmentCount: profile._count.assignments,
      rows,
    })
  } catch (error) {
    console.error("[PRICING_PROFILE_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function PATCH(req: Request, { params }: { params: { profileId: string } }) {
  try {
    const auth = await requireOrgManager()
    if (isAuthError(auth)) return auth

    const profileId = params.profileId
    const organizationId = auth.user.organizationId!

    const profile = await db.pricingProfile.findFirst({
      where: { id: profileId, organizationId, ownerAgentId: null },
      select: { id: true },
    })
    if (!profile) return ApiErrors.NOT_FOUND("Pricing profile")

    const body = await req.json().catch(() => null)
    const validation = updateProfileSchema.safeParse(body)
    if (!validation.success) {
      return ApiErrors.VALIDATION_ERROR(validation.error.flatten().fieldErrors)
    }

    const data = validation.data

    if (data.productId && typeof data.price === "number") {
      const product = await db.product.findFirst({
        where: { id: data.productId, organizationId },
        select: { id: true },
      })
      if (!product) return ApiErrors.NOT_FOUND("Product")

      const item = await db.pricingProfileItem.upsert({
        where: {
          pricingProfileId_productId: {
            pricingProfileId: profileId,
            productId: data.productId,
          },
        },
        create: {
          pricingProfileId: profileId,
          productId: data.productId,
          price: data.price,
        },
        update: { price: data.price },
      })

      return apiSuccess(item, "Profile price updated")
    }

    if (data.name || data.tag !== undefined || data.targetRole) {
      const updated = await db.pricingProfile.update({
        where: { id: profileId },
        data: {
          ...(data.name ? { name: data.name } : {}),
          ...(data.tag !== undefined ? { tag: data.tag ?? null } : {}),
          ...(data.targetRole ? { targetRole: data.targetRole } : {}),
        },
      })
      return apiSuccess(updated, "Profile updated")
    }

    return ApiErrors.BAD_REQUEST("No valid update payload provided")
  } catch (error) {
    console.error("[PRICING_PROFILE_PATCH]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function DELETE(_: Request, { params }: { params: { profileId: string } }) {
  try {
    const auth = await requireOrgManager()
    if (isAuthError(auth)) return auth

    const organizationId = auth.user.organizationId!
    const profileId = params.profileId

    const profile = await db.pricingProfile.findFirst({
      where: { id: profileId, organizationId, ownerAgentId: null },
      select: { id: true },
    })
    if (!profile) return ApiErrors.NOT_FOUND("Pricing profile")

    await db.pricingProfile.delete({ where: { id: profileId } })
    return apiSuccess({ id: profileId }, "Pricing profile deleted")
  } catch (error) {
    console.error("[PRICING_PROFILE_DELETE]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
