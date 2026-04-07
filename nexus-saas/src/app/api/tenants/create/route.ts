import { requireAuth, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { z } from "zod"

const createTenantSchema = z.object({
  name: z.string().min(2),
})

export async function POST(req: Request) {
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) {
      return authResult
    }

    const json = await req.json()
    const body = createTenantSchema.parse(json)

    const existingUser = await db.user.findUnique({ where: { id: authResult.user.id } })

    if (!existingUser) {
      return ApiErrors.NOT_FOUND("User")
    }

    if (existingUser.organizationId) {
      return ApiErrors.CONFLICT("User already has a tenant")
    }

    const baseSlug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    let slug = baseSlug || `tenant-${existingUser.id.slice(0, 6)}`
    let counter = 1

    while (await db.organization.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter++}`
    }

    const organization = await db.organization.create({
      data: {
        name: body.name,
        slug,
        users: {
          connect: { id: existingUser.id },
        },
      },
    })

    await db.user.update({
      where: { id: existingUser.id },
      data: {
        organizationId: organization.id,
        role: "SUBSCRIBER",
      },
    })

    return apiSuccess(organization, "Tenant created", 201)
  } catch (error) {
    logApiError("[TENANT_CREATE]", error)
    if (error instanceof z.ZodError) {
      return ApiErrors.VALIDATION_ERROR(error.flatten().fieldErrors)
    }
    return ApiErrors.INTERNAL_ERROR()
  }
}
