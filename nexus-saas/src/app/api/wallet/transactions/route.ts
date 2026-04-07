import { requireAuth, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"

export async function GET(req: Request) {
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) {
      return authResult
    }

    const url = new URL(req.url)
    const q = url.searchParams.get("q")?.trim()
    const scope = url.searchParams.get("scope")?.trim()
    const userId = url.searchParams.get("userId")?.trim()
    const userEmail = url.searchParams.get("userEmail")?.trim()
    const method = url.searchParams.get("method")?.trim()
    const status = url.searchParams.get("status")?.trim()
    const limitInput = Number(url.searchParams.get("limit") || "50")
    const take = Number.isFinite(limitInput) ? Math.min(Math.max(limitInput, 1), 200) : 50

    const actor = authResult.user

    const actorRow = await db.user.findUnique({
      where: { id: actor.id },
      select: { id: true, role: true, organizationId: true, agentId: true, parentAgentId: true },
    })

    if (!actorRow) {
      return ApiErrors.UNAUTHORIZED()
    }

    const scopeWhere: any = {}
    const isAgentOperator = actorRow.role === "AGENT" || Boolean(actorRow.agentId)

    if (scope === "self") {
      scopeWhere.userId = actorRow.id
    } else if (actorRow.role === "SUPERADMIN") {
      // Full visibility across organizations.
    } else if (actorRow.role === "RESELLER" || Boolean(actorRow.parentAgentId)) {
      // Reseller view must always be self-only.
      scopeWhere.userId = actorRow.id
    } else if (isAgentOperator) {
      if (!actorRow.organizationId) {
        return ApiErrors.INVALID_ORGANIZATION()
      }
      scopeWhere.user = {
        organizationId: actorRow.organizationId,
        OR: [
          { id: actorRow.id },
          { role: "RESELLER", parentAgentId: actorRow.agentId ?? "" },
        ],
      }
    } else if (actorRow.role === "SUBSCRIBER") {
      if (!actorRow.organizationId) {
        return ApiErrors.INVALID_ORGANIZATION()
      }
      scopeWhere.user = { organizationId: actorRow.organizationId }
    } else {
      scopeWhere.userId = actorRow.id
    }

    if (userId) {
      scopeWhere.userId = userId
    }

    if (userEmail) {
      scopeWhere.user = {
        ...(scopeWhere.user ?? {}),
        email: { equals: userEmail, mode: "insensitive" },
      }
    }

    const where: any = {
      ...scopeWhere,
    }

    if (method) {
      where.method = method.toLowerCase()
    }

    if (status) {
      where.status = status.toLowerCase()
    }

    if (q) {
      where.OR = [
        { performedByEmail: { contains: q, mode: "insensitive" } },
        { performedByRole: { contains: q, mode: "insensitive" } },
        { method: { contains: q, mode: "insensitive" } },
        { status: { contains: q, mode: "insensitive" } },
        { user: { email: { contains: q, mode: "insensitive" } } },
        { user: { name: { contains: q, mode: "insensitive" } } },
      ]
    }

    const [sum, rows] = await Promise.all([
      db.walletTransaction.aggregate({
        _sum: { amount: true },
        where: {
          ...scopeWhere,
          status: "success",
        },
      }),
      db.walletTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              image: true,
            },
          },
        },
      }),
    ])

    const results = rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      method: row.method,
      status: row.status,
      amount: row.amount,
      performedByEmail: row.performedByEmail,
      performedByRole: row.performedByRole,
      user: {
        id: row.user?.id ?? null,
        name: row.user?.name ?? null,
        email: row.user?.email ?? null,
        role: row.user?.role ?? null,
        avatarUrl: row.user?.image ?? null,
      },
    }))

    return apiSuccess({
      balance: sum._sum.amount ?? 0,
      results,
    })
  } catch (error) {
    logApiError("[WALLET_TRANSACTIONS_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
