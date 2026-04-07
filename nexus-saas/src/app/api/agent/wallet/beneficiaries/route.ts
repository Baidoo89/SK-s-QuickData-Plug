import { requireAuth, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"

type CandidateUser = {
  id: string
  name: string | null
  email: string | null
  role: string
  image: string | null
}

function getSuggestionScore(user: CandidateUser, query: string, actorId: string): number {
  const email = (user.email ?? "").toLowerCase()
  const name = (user.name ?? "").toLowerCase()

  let score = 0
  if (email === query) score += 120
  if (email.startsWith(query)) score += 80
  if (email.includes(query)) score += 30

  if (name === query) score += 70
  if (name.startsWith(query)) score += 45
  if (name.includes(query)) score += 20

  if (user.id === actorId) score += 15
  if (user.role === "RESELLER") score += 5

  return score
}

export async function GET(req: Request) {
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) {
      return authResult
    }

    const url = new URL(req.url)
    const q = url.searchParams.get("q")?.trim() ?? ""
    const normalizedQuery = q.toLowerCase()
    if (q.length < 2) {
      return apiSuccess({ results: [] })
    }

    const actor = authResult.user
    const role = actor.role
    const organizationId = actor.organizationId

    if (role !== "SUPERADMIN" && !organizationId) {
      return ApiErrors.INVALID_ORGANIZATION()
    }

    const actorRow = await db.user.findUnique({
      where: { id: actor.id },
      select: { id: true, agentId: true },
    })

    const isAgentOperator = role === "AGENT" || Boolean(actorRow?.agentId)

    const where: any = {
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    }

    if (role === "SUPERADMIN") {
      // Superadmin can credit any user, so suggestions should span all roles.
    } else if (isAgentOperator && organizationId) {
      where.organizationId = organizationId
      where.AND = [
        {
          OR: [
            { id: actor.id },
            { role: "RESELLER", parentAgentId: actorRow?.agentId ?? "" },
          ],
        },
      ]
    } else if (role === "SUBSCRIBER" && organizationId) {
      // Subscriber admin can credit any user inside the same organization.
      where.organizationId = organizationId
    } else if (organizationId) {
      where.organizationId = organizationId
      where.role = { in: ["AGENT", "RESELLER"] }
    }

    const users = await db.user.findMany({
      where,
      take: 50,
      orderBy: { email: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        image: true,
      },
    })

    const candidates = users.filter((u) => Boolean(u.email)) as CandidateUser[]
    if (candidates.length === 0) {
      return apiSuccess({ results: [] })
    }

    const scored = candidates
      .map((user) => ({
        user,
        score: getSuggestionScore(user, normalizedQuery, actor.id),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || (a.user.email ?? "").localeCompare(b.user.email ?? ""))
      .slice(0, 8)

    const userIds = scored.map((entry) => entry.user.id)
    const walletSums = await db.walletTransaction.groupBy({
      by: ["userId"],
      where: {
        userId: { in: userIds },
        status: "success",
      },
      _sum: { amount: true },
    })

    const balancesByUserId = new Map(walletSums.map((row) => [row.userId, row._sum.amount ?? 0]))

    const results = scored.map(({ user }) => ({
      id: user.id,
      name: user.name,
      email: user.email ?? "",
      role: user.role,
      avatarUrl: user.image,
      balance: balancesByUserId.get(user.id) ?? 0,
    }))

    return apiSuccess({ results })
  } catch (error) {
    logApiError("[AGENT_WALLET_BENEFICIARIES]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
