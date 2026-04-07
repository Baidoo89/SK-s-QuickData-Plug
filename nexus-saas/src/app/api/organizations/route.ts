import { requireAdmin, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { Prisma } from "@prisma/client"

export async function GET(req: Request) {
  try {
    const authResult = await requireAdmin()
    if (isAuthError(authResult)) {
      return authResult
    }

    const url = new URL(req.url)
    const q = url.searchParams.get("q") ?? undefined
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"))
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") || "10")))
    const skip = (page - 1) * pageSize

    const where: Prisma.OrganizationWhereInput | undefined = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { slug: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : undefined

    const [total, orgs] = await Promise.all([
      db.organization.count({ where }),
      db.organization.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          users: { select: { email: true, role: true } },
          products: { where: { active: true }, select: { id: true } },
        },
        skip,
        take: pageSize,
      }),
    ])

    const response = orgs.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      createdAt: o.createdAt,
      users: o.users,
      activeProductsCount: (o as any).products?.length ?? 0,
      active: (o as any).active ?? true,
    }))

    return apiSuccess({ items: response, total, page, pageSize })
  } catch (error) {
    logApiError("[ORG_LIST]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
