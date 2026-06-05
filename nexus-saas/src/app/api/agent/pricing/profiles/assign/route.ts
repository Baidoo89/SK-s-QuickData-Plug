import { z } from "zod"
import { requireAuth, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors } from "@/lib/api-response"
import { db } from "@/lib/db"
import { resolveAgentContext } from "@/lib/agent-context"

const assignSchema = z.object({
  resellerId: z.string().min(1),
  profileId: z.string().optional().nullable(),
  strictPricing: z.boolean().optional().default(false),
})

export async function POST(req: Request) {
  try {
    const auth = await requireAuth()
    if (isAuthError(auth)) return auth
    if (!auth.user.organizationId) return ApiErrors.BAD_REQUEST("User not linked to organization")

    const { agentId } = await resolveAgentContext(auth.user.id, auth.user.organizationId)
    if (!agentId) return ApiErrors.BAD_REQUEST("Agent profile not linked to this account.")

    const body = await req.json().catch(() => null)
    const validation = assignSchema.safeParse(body)
    if (!validation.success) return ApiErrors.VALIDATION_ERROR(validation.error.flatten().fieldErrors)
    const { resellerId, profileId, strictPricing } = validation.data

    const reseller = await db.user.findFirst({
      where: { id: resellerId, organizationId: auth.user.organizationId, role: "RESELLER", parentAgentId: agentId },
      select: { id: true },
    })
    if (!reseller) return ApiErrors.NOT_FOUND("Reseller")

    if (!profileId) {
      await db.userPricingProfileAssignment.deleteMany({
        where: { organizationId: auth.user.organizationId, userId: resellerId },
      })
      return apiSuccess({ resellerId, profileId: null }, "Pricing profile cleared")
    }

    const profile = await db.pricingProfile.findFirst({
      where: { id: profileId, organizationId: auth.user.organizationId, ownerAgentId: agentId, targetRole: { in: ["RESELLER", "BOTH"] } },
      select: { id: true },
    })
    if (!profile) return ApiErrors.NOT_FOUND("Pricing profile")

    await db.userPricingProfileAssignment.upsert({
      where: { organizationId_userId: { organizationId: auth.user.organizationId, userId: resellerId } },
      create: {
        organizationId: auth.user.organizationId,
        userId: resellerId,
        pricingProfileId: profile.id,
        strictPricing: Boolean(strictPricing),
      },
      update: {
        pricingProfileId: profile.id,
        strictPricing: Boolean(strictPricing),
      },
    })

    return apiSuccess({ resellerId, profileId: profile.id, strictPricing: Boolean(strictPricing) }, "Pricing profile assigned")
  } catch (error) {
    console.error("[AGENT_PRICING_PROFILE_ASSIGN]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
