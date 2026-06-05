import { z } from "zod"
import { db } from "@/lib/db"
import { apiSuccess, ApiErrors } from "@/lib/api-response"
import { requireOrgManager, isAuthError } from "@/lib/auth-guard"
import { NextResponse } from "next/server"

const assignSchema = z.object({
  userId: z.string().min(1),
  profileId: z.string().optional().nullable(),
  strictPricing: z.boolean().optional().default(false),
  returnTo: z.string().optional(),
})

function redirectIfNeeded(returnTo: string | undefined, requestUrl: string): NextResponse | null {
  if (returnTo && returnTo.startsWith("/")) {
    return NextResponse.redirect(new URL(returnTo, requestUrl))
  }
  return null
}

export async function POST(req: Request) {
  try {
    const auth = await requireOrgManager()
    if (isAuthError(auth)) return auth

    const organizationId = auth.user.organizationId!
    const pricingProfiles = (db as any)["pricingProfile"] as any
    const profileAssignments = (db as any)["userPricingProfileAssignment"] as any

    let parsed: z.infer<typeof assignSchema>

    const contentType = req.headers.get("content-type") || ""
    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const form = await req.formData()
      parsed = assignSchema.parse({
        userId: String(form.get("userId") ?? ""),
        profileId: form.get("profileId") ? String(form.get("profileId")) : null,
        strictPricing: form.get("strictPricing") === "on",
        returnTo: form.get("returnTo") ? String(form.get("returnTo")) : undefined,
      })
    } else {
      const body = await req.json().catch(() => null)
      const validation = assignSchema.safeParse(body)
      if (!validation.success) {
        return ApiErrors.VALIDATION_ERROR(validation.error.flatten().fieldErrors)
      }
      parsed = validation.data
    }

    const user = await db.user.findFirst({
      where: {
        id: parsed.userId,
        organizationId,
        role: { in: ["AGENT", "RESELLER"] },
      },
      select: { id: true, role: true },
    })

    if (!user) return ApiErrors.NOT_FOUND("Assignable user")

    if (!parsed.profileId) {
      await profileAssignments.deleteMany({
        where: { organizationId, userId: parsed.userId },
      })
      const redirectResponse = redirectIfNeeded(parsed.returnTo, req.url)
      if (redirectResponse) return redirectResponse
      return apiSuccess({ userId: parsed.userId, profileId: null }, "Pricing profile cleared")
    }

    const profile = await pricingProfiles.findFirst({
      where: { id: parsed.profileId, organizationId, ownerAgentId: null },
      select: { id: true, targetRole: true },
    })

    if (!profile) return ApiErrors.NOT_FOUND("Pricing profile")

    if (profile.targetRole !== "BOTH" && profile.targetRole !== user.role) {
      return ApiErrors.BAD_REQUEST("Profile role does not match selected user")
    }

    await profileAssignments.upsert({
      where: {
        organizationId_userId: {
          organizationId,
          userId: parsed.userId,
        },
      },
      create: {
        organizationId,
        userId: parsed.userId,
        pricingProfileId: profile.id,
        strictPricing: Boolean(parsed.strictPricing),
      },
      update: {
        pricingProfileId: profile.id,
        strictPricing: Boolean(parsed.strictPricing),
      },
    })

    const redirectResponse = redirectIfNeeded(parsed.returnTo, req.url)
    if (redirectResponse) return redirectResponse
    return apiSuccess({ userId: parsed.userId, profileId: profile.id, strictPricing: Boolean(parsed.strictPricing) }, "Pricing profile assigned")
  } catch (error) {
    console.error("[PRICING_PROFILE_ASSIGN]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
