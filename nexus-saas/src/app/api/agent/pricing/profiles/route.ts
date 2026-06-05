import { z } from "zod"
import { requireAuth, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors } from "@/lib/api-response"
import { db } from "@/lib/db"
import { resolveAgentContext } from "@/lib/agent-context"

const createProfileSchema = z.object({
  name: z.string().min(2).max(80),
  tag: z.string().max(50).optional().nullable(),
})

export async function GET(req: Request) {
  try {
    const auth = await requireAuth()
    if (isAuthError(auth)) return auth
    if (!auth.user.organizationId) return ApiErrors.BAD_REQUEST("User not linked to organization")

    const { agentId } = await resolveAgentContext(auth.user.id, auth.user.organizationId)
    if (!agentId) return ApiErrors.BAD_REQUEST("Agent profile not linked to this account.")

    const { searchParams } = new URL(req.url)
    const resellerId = searchParams.get("resellerId")

    if (resellerId) {
      const reseller = await db.user.findFirst({
        where: { id: resellerId, organizationId: auth.user.organizationId, role: "RESELLER", parentAgentId: agentId },
        select: { id: true },
      })
      if (!reseller) return ApiErrors.NOT_FOUND("Reseller")
    }

    const [profiles, assignment] = await Promise.all([
      db.pricingProfile.findMany({
        where: {
          organizationId: auth.user.organizationId,
          ownerAgentId: agentId,
          targetRole: { in: ["RESELLER", "BOTH"] },
        },
        include: {
          _count: { select: { items: true, assignments: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      resellerId
        ? db.userPricingProfileAssignment.findFirst({
            where: { organizationId: auth.user.organizationId, userId: resellerId },
            select: { pricingProfileId: true, strictPricing: true },
          })
        : null,
    ])

    return apiSuccess({
      profiles: profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        tag: profile.tag,
        targetRole: profile.targetRole,
        itemCount: profile._count.items,
        assignmentCount: profile._count.assignments,
        createdAt: profile.createdAt,
      })),
      assignment,
    })
  } catch (error) {
    console.error("[AGENT_PRICING_PROFILES_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth()
    if (isAuthError(auth)) return auth
    if (!auth.user.organizationId) return ApiErrors.BAD_REQUEST("User not linked to organization")

    const { agentId } = await resolveAgentContext(auth.user.id, auth.user.organizationId)
    if (!agentId) return ApiErrors.BAD_REQUEST("Agent profile not linked to this account.")

    const body = await req.json().catch(() => null)
    const validation = createProfileSchema.safeParse(body)
    if (!validation.success) return ApiErrors.VALIDATION_ERROR(validation.error.flatten().fieldErrors)

    const { name, tag } = validation.data
    const existing = await db.pricingProfile.findFirst({
      where: { organizationId: auth.user.organizationId, ownerAgentId: agentId, name },
      select: { id: true },
    })
    if (existing) return ApiErrors.CONFLICT("You already have a reseller pricing profile with this name")

    const products = await db.product.findMany({
      where: { organizationId: auth.user.organizationId, active: true },
      select: {
        id: true,
        price: true,
        agentPrices: { where: { agentId, organizationId: auth.user.organizationId }, select: { price: true }, take: 1 },
      },
      orderBy: { name: "asc" },
    })

    const profile = await db.pricingProfile.create({
      data: {
        organizationId: auth.user.organizationId,
        ownerAgentId: agentId,
        name,
        tag: tag ?? null,
        targetRole: "RESELLER",
        items: {
          create: products.map((product) => ({
            productId: product.id,
            price: product.agentPrices[0]?.price ?? product.price,
          })),
        },
      },
      include: { _count: { select: { items: true } } },
    })

    return apiSuccess({
      id: profile.id,
      name: profile.name,
      tag: profile.tag,
      targetRole: profile.targetRole,
      itemCount: profile._count.items,
    }, "Reseller pricing profile created", 201)
  } catch (error) {
    console.error("[AGENT_PRICING_PROFILES_POST]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
