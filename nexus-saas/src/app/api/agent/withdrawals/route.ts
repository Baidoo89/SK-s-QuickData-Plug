import { requireAuth, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { WITHDRAWAL_STATUS } from "@/lib/withdrawal-status"

export const dynamic = "force-dynamic"

type WithdrawalRow = {
  id: string
  amount: number
  status: string
  note: string | null
  requestedByEmail: string | null
  requestedByRole: string | null
  reviewedByEmail: string | null
  reviewedAt: Date | null
  createdAt: Date
  updatedAt: Date
  user: {
    id: string
    name: string | null
    email: string | null
    role: string
  }
}

async function resolveActorAgentId(userId: string, organizationId: string | null) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { agentId: true },
  })

  if (user?.agentId) return user.agentId
  if (!organizationId) return null

  const fallback = await db.agent.findFirst({
    where: {
      organizationId,
      user: { id: userId },
    },
    select: { id: true },
  })

  return fallback?.id ?? null
}

export async function GET(req: Request) {
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) {
      return authResult
    }

    const actor = authResult.user
    if (actor.role !== "AGENT") {
      return ApiErrors.FORBIDDEN()
    }

    const actorAgentId = await resolveActorAgentId(actor.id, actor.organizationId)
    if (!actorAgentId) {
      return ApiErrors.FORBIDDEN()
    }

    const url = new URL(req.url)
    const status = url.searchParams.get("status")?.trim().toUpperCase()
    const q = url.searchParams.get("q")?.trim()
    const limitInput = Number(url.searchParams.get("limit") || "50")
    const take = Number.isFinite(limitInput) ? Math.min(Math.max(limitInput, 1), 200) : 50

    const where: any = {
      organizationId: actor.organizationId ?? undefined,
      user: {
        role: "RESELLER",
        parentAgentId: actorAgentId,
      },
    }

    if (status) {
      where.status = status
    }

    if (q) {
      where.OR = [
        { note: { contains: q, mode: "insensitive" } },
        { requestedByEmail: { contains: q, mode: "insensitive" } },
        { reviewedByEmail: { contains: q, mode: "insensitive" } },
        { user: { email: { contains: q, mode: "insensitive" } } },
        { user: { name: { contains: q, mode: "insensitive" } } },
      ]
    }

    const completedResellerOrderWhere = {
      organizationId: actor.organizationId ?? undefined,
      status: "COMPLETED",
      user: {
        role: "RESELLER",
        parentAgentId: actorAgentId,
      },
    }

    const [summary, requests, completedSalesAgg, earningsAgg, paidAgg] = await Promise.all([
      db.withdrawalRequest.aggregate({
        _sum: { amount: true },
        where: {
          ...where,
          status: { in: [WITHDRAWAL_STATUS.PENDING, WITHDRAWAL_STATUS.APPROVED] },
        },
      }),
      db.withdrawalRequest.findMany({
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
            },
          },
        },
      }),
      db.order.aggregate({
        _sum: { total: true },
        where: completedResellerOrderWhere,
      }),
      db.orderItem.aggregate({
        _sum: { profit: true },
        where: {
          order: completedResellerOrderWhere,
        },
      }),
      db.withdrawalRequest.aggregate({
        _sum: { amount: true },
        where: {
          ...where,
          status: WITHDRAWAL_STATUS.PAID,
        },
      }),
    ])

    const results = requests.map((request: WithdrawalRow) => ({
      id: request.id,
      amount: request.amount,
      status: request.status,
      note: request.note,
      requestedByEmail: request.requestedByEmail,
      requestedByRole: request.requestedByRole,
      reviewedByEmail: request.reviewedByEmail,
      reviewedAt: request.reviewedAt ? request.reviewedAt.toISOString() : null,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
      user: request.user,
    }))

    return apiSuccess({
      pendingAmount: summary._sum.amount ?? 0,
      totalCollected: completedSalesAgg._sum.total ?? 0,
      totalEarningsLiability: earningsAgg._sum.profit ?? 0,
      totalPaidOut: paidAgg._sum.amount ?? 0,
      outstandingLiability: Math.max((earningsAgg._sum.profit ?? 0) - (paidAgg._sum.amount ?? 0), 0),
      results,
    })
  } catch (error) {
    logApiError("[AGENT_WITHDRAWALS_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
