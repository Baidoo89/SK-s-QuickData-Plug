import { requireAuthAndOrg, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { z } from "zod"

const updateTenantSchema = z.object({
  name: z.string().min(2),
})

export async function PUT(req: Request) {
  try {
    const authResult = await requireAuthAndOrg()
    if (isAuthError(authResult)) {
      return authResult
    }

    const json = await req.json()
    const body = updateTenantSchema.parse(json)

    const orgId = authResult.user.organizationId!

    const organizationCurrent = await db.organization.findUnique({
      where: { id: orgId },
      select: { id: true, slug: true },
    })

    if (!organizationCurrent) {
      return ApiErrors.NOT_FOUND("Tenant")
    }

    const baseSlug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    let slug = baseSlug || organizationCurrent.slug
    let counter = 1

    while (slug !== organizationCurrent.slug && (await db.organization.findUnique({ where: { slug } }))) {
      slug = `${baseSlug}-${counter++}`
    }

    const organization = await db.organization.update({
      where: { id: organizationCurrent.id },
      data: {
        name: body.name,
        slug,
      },
    })

    return apiSuccess(organization)
  } catch (error) {
    logApiError("[TENANT_UPDATE]", error)
    if (error instanceof z.ZodError) {
      return ApiErrors.VALIDATION_ERROR(error.flatten().fieldErrors)
    }
    return ApiErrors.INTERNAL_ERROR()
  }
}
