import { db } from "@/lib/db"
import { getUserWithdrawableSummary } from "@/lib/withdrawal-balance"
import {
  canTransitionWithdrawalStatus,
  isWithdrawalStatus,
  normalizeWithdrawalStatus,
  WITHDRAWAL_STATUS,
  type WithdrawalStatus,
} from "@/lib/withdrawal-status"

export const AGENT_WITHDRAWAL_STATUSES = ["PENDING", "APPROVED", "PAID", "REJECTED", "CANCELED"] as const

export type WithdrawalReviewActor = {
  id: string
  email: string
  role: string
  organizationId: string | null
}

type ListAgentWithdrawalOptions = {
  organizationId?: string
  status?: string
  q?: string
  take?: number
}

type UpdateAgentWithdrawalOptions = {
  requestId: string
  actor: WithdrawalReviewActor
  status: string
  note?: string
  organizationId?: string
}

export function normalizeWithdrawalLimit(input: string | null) {
  const limitInput = Number(input || "50")
  return Number.isFinite(limitInput) ? Math.min(Math.max(limitInput, 1), 200) : 50
}

export function isAllowedAgentWithdrawalStatus(status?: string) {
  return Boolean(status && AGENT_WITHDRAWAL_STATUSES.includes(status as (typeof AGENT_WITHDRAWAL_STATUSES)[number]))
}

export async function listAgentWithdrawalRequests(options: ListAgentWithdrawalOptions) {
  const where: any = {
    user: {
      role: "AGENT",
    },
  }
  const orgWhere: any = {}

  if (options.organizationId) {
    where.organizationId = options.organizationId
    orgWhere.organizationId = options.organizationId
  }

  if (isAllowedAgentWithdrawalStatus(options.status)) {
    where.status = options.status
  }

  if (options.q) {
    where.OR = [
      { note: { contains: options.q, mode: "insensitive" } },
      { requestedByEmail: { contains: options.q, mode: "insensitive" } },
      { reviewedByEmail: { contains: options.q, mode: "insensitive" } },
      { user: { email: { contains: options.q, mode: "insensitive" } } },
      { user: { name: { contains: options.q, mode: "insensitive" } } },
      { user: { role: { contains: options.q, mode: "insensitive" } } },
    ]
  }

  const completedAgentOrderWhere = {
    ...orgWhere,
    status: "COMPLETED",
    agentId: { not: null },
    OR: [
      { userId: null },
      { user: { role: "AGENT" } },
    ],
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
      take: options.take ?? 50,
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
      where: completedAgentOrderWhere,
    }),
    db.orderItem.aggregate({
      _sum: { profit: true },
      where: {
        order: completedAgentOrderWhere,
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

  const results = requests.map((request) => ({
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

  return {
    pendingAmount: summary._sum.amount ?? 0,
    totalCollected: completedSalesAgg._sum.total ?? 0,
    totalEarningsLiability: earningsAgg._sum.profit ?? 0,
    totalPaidOut: paidAgg._sum.amount ?? 0,
    outstandingLiability: Math.max((earningsAgg._sum.profit ?? 0) - (paidAgg._sum.amount ?? 0), 0),
    results,
  }
}

export async function updateAgentWithdrawalRequest(options: UpdateAgentWithdrawalOptions) {
  if (!isWithdrawalStatus(options.status)) {
    return { ok: false as const, code: "BAD_STATUS" }
  }

  const status = normalizeWithdrawalStatus(options.status)
  const requestRow = await db.withdrawalRequest.findUnique({
    where: { id: options.requestId },
    select: {
      id: true,
      userId: true,
      status: true,
      organizationId: true,
      user: {
        select: {
          role: true,
        },
      },
    },
  })

  if (!requestRow) {
    return { ok: false as const, code: "NOT_FOUND" }
  }

  if (requestRow.user?.role !== "AGENT") {
    return { ok: false as const, code: "FORBIDDEN" }
  }

  if (options.organizationId && requestRow.organizationId !== options.organizationId) {
    return { ok: false as const, code: "FORBIDDEN" }
  }

  if (requestRow.status === status) {
    const existing = await db.withdrawalRequest.findUnique({
      where: { id: requestRow.id },
    })

    if (!existing) {
      return { ok: false as const, code: "NOT_FOUND" }
    }

    return {
      ok: true as const,
      idempotent: true,
      withdrawal: serializeWithdrawal(existing),
    }
  }

  if (!canTransitionWithdrawalStatus(requestRow.status, status)) {
    return {
      ok: false as const,
      code: "INVALID_TRANSITION",
      from: requestRow.status,
      to: status,
    }
  }

  if (status === WITHDRAWAL_STATUS.APPROVED || status === WITHDRAWAL_STATUS.PAID) {
    const balance = await getUserWithdrawableSummary(requestRow.userId, {
      excludeWithdrawalRequestId: requestRow.id,
    })

    const request = await db.withdrawalRequest.findUnique({
      where: { id: requestRow.id },
      select: { amount: true },
    })

    if (!request) {
      return { ok: false as const, code: "NOT_FOUND" }
    }

    if (request.amount > balance.availableBalance) {
      return {
        ok: false as const,
        code: "INSUFFICIENT_EARNINGS",
        availableBalance: balance.availableBalance,
        amount: request.amount,
      }
    }
  }

  const now = new Date()

  const updateResult = await db.withdrawalRequest.updateMany({
    where: {
      id: requestRow.id,
      status: requestRow.status,
    },
    data: {
      status,
      note: options.note || undefined,
      reviewedByEmail: options.actor.email,
      reviewedAt: now,
    },
  })

  if (updateResult.count === 0) {
    const latest = await db.withdrawalRequest.findUnique({ where: { id: requestRow.id } })
    if (!latest) {
      return { ok: false as const, code: "NOT_FOUND" }
    }

    if (latest.status === status) {
      return {
        ok: true as const,
        idempotent: true,
        withdrawal: serializeWithdrawal(latest),
      }
    }

    return { ok: false as const, code: "CONFLICT" }
  }

  const updated = await db.withdrawalRequest.findUnique({ where: { id: requestRow.id } })
  if (!updated) {
    return { ok: false as const, code: "NOT_FOUND" }
  }

  await db.auditLog.create({
    data: {
      action: "WITHDRAWAL_STATUS_CHANGED",
      targetType: "WITHDRAWAL_REQUEST",
      targetId: updated.id,
      organizationId: requestRow.organizationId,
      actorId: options.actor.id,
      actorName: options.actor.email,
      meta: JSON.stringify({
        from: requestRow.status,
        to: status,
        reviewedByEmail: options.actor.email,
      }),
    },
  })

  return {
    ok: true as const,
    withdrawal: serializeWithdrawal(updated),
  }
}

function serializeWithdrawal(withdrawal: {
  id: string
  amount: number
  status: WithdrawalStatus | string
  note: string | null
  requestedByEmail: string | null
  requestedByRole: string | null
  reviewedByEmail: string | null
  reviewedAt: Date | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: withdrawal.id,
    amount: withdrawal.amount,
    status: withdrawal.status,
    note: withdrawal.note,
    requestedByEmail: withdrawal.requestedByEmail,
    requestedByRole: withdrawal.requestedByRole,
    reviewedByEmail: withdrawal.reviewedByEmail,
    reviewedAt: withdrawal.reviewedAt ? withdrawal.reviewedAt.toISOString() : null,
    createdAt: withdrawal.createdAt.toISOString(),
    updatedAt: withdrawal.updatedAt.toISOString(),
  }
}
