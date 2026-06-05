import { z } from "zod"
import { db } from "@/lib/db"
import { apiSuccess, ApiErrors } from "@/lib/api-response"
import { requireOrgManager, isAuthError } from "@/lib/auth-guard"

const createProfileSchema = z.object({
  name: z.string().min(2).max(80),
  tag: z.string().max(50).optional().nullable(),
  targetRole: z.enum(["AGENT", "RESELLER", "BOTH"]).default("BOTH"),
})

export async function GET() {
  try {
    const auth = await requireOrgManager()
    if (isAuthError(auth)) return auth

    const organizationId = auth.user.organizationId!

    const profiles = await db.pricingProfile.findMany({
      where: { organizationId, ownerAgentId: null },
      include: {
        _count: { select: { items: true, assignments: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    return apiSuccess(
      profiles.map((p) => ({
        id: p.id,
        name: p.name,
        tag: p.tag,
        targetRole: p.targetRole,
        itemCount: p._count.items,
        assignmentCount: p._count.assignments,
        createdAt: p.createdAt,
      }))
    )
  } catch (error) {
    console.error("[PRICING_PROFILES_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireOrgManager()
    if (isAuthError(auth)) return auth

    const body = await req.json().catch(() => null)
    const validation = createProfileSchema.safeParse(body)
    if (!validation.success) {
      return ApiErrors.VALIDATION_ERROR(validation.error.flatten().fieldErrors)
    }

    const organizationId = auth.user.organizationId!
    const { name, tag, targetRole } = validation.data

    const existing = await db.pricingProfile.findFirst({
      where: { organizationId, ownerAgentId: null, name },
      select: { id: true },
    })
    if (existing) {
      return ApiErrors.CONFLICT("A pricing profile with this name already exists")
    }

    const products = await db.product.findMany({
      where: { organizationId, active: true },
      select: {
        id: true,
        price: true,
        basePrices: {
          where: { organizationId },
          select: { price: true },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    })

    const profile = await db.pricingProfile.create({
      data: {
        organizationId,
        ownerAgentId: null,
        name,
        tag: tag ?? null,
        targetRole,
        items: {
          create: products.map((product) => ({
            productId: product.id,
            price: product.basePrices[0]?.price ?? product.price,
          })),
        },
      },
      include: {
        _count: { select: { items: true } },
      },
    })

    return apiSuccess(
      {
        id: profile.id,
        name: profile.name,
        tag: profile.tag,
        targetRole: profile.targetRole,
        itemCount: profile._count.items,
      },
      "Pricing profile created",
      201
    )
  } catch (error) {
    console.error("[PRICING_PROFILES_POST]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
