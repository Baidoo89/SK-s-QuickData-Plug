import { db } from "@/lib/db"

const LOCKED_STATUSES = ["PENDING", "APPROVED"]

type WithdrawableSummaryOptions = {
  excludeWithdrawalRequestId?: string
}

export async function getUserWithdrawableSummary(userId: string, options: WithdrawableSummaryOptions = {}) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      organizationId: true,
      agentId: true,
      parentAgentId: true,
    },
  })

  if (!user) {
    return {
      profitEarned: 0,
      paidOut: 0,
      lockedAmount: 0,
      availableBalance: 0,
      requesterRole: "UNKNOWN",
    }
  }

  let profitEarned = 0

  if (user.role === "AGENT") {
    let agentId = user.agentId

    if (!agentId && user.organizationId) {
      const fallbackAgent = await db.agent.findFirst({
        where: {
          organizationId: user.organizationId,
          user: { id: user.id },
        },
        select: { id: true },
      })
      agentId = fallbackAgent?.id ?? null
    }

    if (agentId) {
      const agg = await db.orderItem.aggregate({
        _sum: { profit: true },
        where: {
          order: {
            status: "COMPLETED",
            agentId,
            OR: [
              { userId: null },
              { userId: user.id },
            ],
            organizationId: user.organizationId ?? undefined,
          },
        },
      })
      profitEarned = agg._sum.profit ?? 0
    }
  } else if (user.role === "RESELLER") {
    const agg = await db.orderItem.aggregate({
      _sum: { profit: true },
      where: {
        order: {
          status: "COMPLETED",
          userId: user.id,
          organizationId: user.organizationId ?? undefined,
        },
      },
    })
    profitEarned = agg._sum.profit ?? 0
  }

  const [paidAgg, lockedAgg] = await Promise.all([
    db.withdrawalRequest.aggregate({
      _sum: { amount: true },
      where: {
        userId: user.id,
        status: "PAID",
        ...(options.excludeWithdrawalRequestId ? { id: { not: options.excludeWithdrawalRequestId } } : {}),
      },
    }),
    db.withdrawalRequest.aggregate({
      _sum: { amount: true },
      where: {
        userId: user.id,
        status: { in: LOCKED_STATUSES },
        ...(options.excludeWithdrawalRequestId ? { id: { not: options.excludeWithdrawalRequestId } } : {}),
      },
    }),
  ])

  const paidOut = paidAgg._sum.amount ?? 0
  const lockedAmount = lockedAgg._sum.amount ?? 0
  const availableBalance = Math.max(profitEarned - paidOut - lockedAmount, 0)

  return {
    profitEarned,
    paidOut,
    lockedAmount,
    availableBalance,
    requesterRole: user.role,
  }
}
