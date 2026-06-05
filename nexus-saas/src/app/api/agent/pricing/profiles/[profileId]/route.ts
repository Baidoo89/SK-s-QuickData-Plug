import { z } from "zod"
import { requireAuth, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors } from "@/lib/api-response"
import { db } from "@/lib/db"
import { resolveAgentContext } from "@/lib/agent-context"

const updateProfileSchema = z.object({
  productId: z.string().optional(),
  price: z.number().min(0).optional(),
  name: z.string().min(2).max(80).optional(),
  tag: z.string().max(50).nullable().optional(),
})

async function resolveOwnedProfile(userId: string, organizationId: string, profileId: string) {
  const { agentId } = await resolveAgentContext(userId, organizationId)
  if (!agentId) return { agentId: null, profile: null }

  const profile = await db.pricingProfile.findFirst({
    where: { id: profileId, organizationId, ownerAgentId: agentId },
    select: { id: true },
  })

  return { agentId, profile }
}

export async function GET(_: Request, { params }: { params: { profileId: string } }) {
  try {
    const auth = await requireAuth()
    if (isAuthError(auth)) return auth
    if (!auth.user.organizationId) return ApiErrors.BAD_REQUEST("User not linked to organization")

    const { agentId, profile } = await resolveOwnedProfile(auth.user.id, auth.user.organizationId, params.profileId)
    if (!agentId) return ApiErrors.BAD_REQUEST("Agent profile not linked to this account.")
    if (!profile) return ApiErrors.NOT_FOUND("Pricing profile")

    const fullProfile = await db.pricingProfile.findFirst({
      where: { id: params.profileId, organizationId: auth.user.organizationId, ownerAgentId: agentId },
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
                agentPrices: { where: { agentId, organizationId: auth.user.organizationId }, select: { price: true }, take: 1 },
              },
            },
          },
          orderBy: { product: { name: "asc" } },
        },
        _count: { select: { assignments: true } },
      },
    })

    if (!fullProfile) return ApiErrors.NOT_FOUND("Pricing profile")

    const rows = fullProfile.items
      .filter((item) => item.product.active)
      .map((item) => {
        const parentCost = item.product.agentPrices[0]?.price ?? item.product.price
        return {
          productId: item.productId,
          productName: item.product.name,
          network: item.product.provider,
          category: item.product.category,
          parentCost,
          profilePrice: item.price,
        }
      })

    return apiSuccess({
      id: fullProfile.id,
      name: fullProfile.name,
      tag: fullProfile.tag,
      targetRole: fullProfile.targetRole,
      assignmentCount: fullProfile._count.assignments,
      rows,
    })
  } catch (error) {
    console.error("[AGENT_PRICING_PROFILE_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function PATCH(req: Request, { params }: { params: { profileId: string } }) {
  try {
    const auth = await requireAuth()
    if (isAuthError(auth)) return auth
    if (!auth.user.organizationId) return ApiErrors.BAD_REQUEST("User not linked to organization")

    const { agentId, profile } = await resolveOwnedProfile(auth.user.id, auth.user.organizationId, params.profileId)
    if (!agentId) return ApiErrors.BAD_REQUEST("Agent profile not linked to this account.")
    if (!profile) return ApiErrors.NOT_FOUND("Pricing profile")

    const body = await req.json().catch(() => null)
    const validation = updateProfileSchema.safeParse(body)
    if (!validation.success) return ApiErrors.VALIDATION_ERROR(validation.error.flatten().fieldErrors)
    const data = validation.data

    if (data.productId && typeof data.price === "number") {
      const product = await db.product.findFirst({
        where: { id: data.productId, organizationId: auth.user.organizationId, active: true },
        include: { agentPrices: { where: { agentId, organizationId: auth.user.organizationId }, select: { price: true }, take: 1 } },
      })
      if (!product) return ApiErrors.NOT_FOUND("Product")

      const parentCost = product.agentPrices[0]?.price ?? product.price
      if (data.price < parentCost) {
        return ApiErrors.BAD_REQUEST(`Profile price cannot be below your agent cost (${parentCost}).`)
      }

      const item = await db.pricingProfileItem.upsert({
        where: { pricingProfileId_productId: { pricingProfileId: profile.id, productId: data.productId } },
        create: { pricingProfileId: profile.id, productId: data.productId, price: data.price },
        update: { price: data.price },
      })
      return apiSuccess(item, "Profile price updated")
    }

    if (data.name || data.tag !== undefined) {
      const updated = await db.pricingProfile.update({
        where: { id: profile.id },
        data: {
          ...(data.name ? { name: data.name } : {}),
          ...(data.tag !== undefined ? { tag: data.tag ?? null } : {}),
        },
      })
      return apiSuccess(updated, "Profile updated")
    }

    return ApiErrors.BAD_REQUEST("No valid update payload provided")
  } catch (error) {
    console.error("[AGENT_PRICING_PROFILE_PATCH]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
