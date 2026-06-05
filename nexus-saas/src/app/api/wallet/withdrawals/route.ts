import { requireAuth, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { getUserWithdrawableSummary } from "@/lib/withdrawal-balance"
import { WITHDRAWAL_STATUS } from "@/lib/withdrawal-status"

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
}

export async function GET() {
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) {
      return authResult
    }

    const actor = authResult.user
    if (!["AGENT", "RESELLER"].includes(actor.role)) {
      return ApiErrors.FORBIDDEN()
    }

    const [summary, requests] = await Promise.all([
      getUserWithdrawableSummary(actor.id),
      db.withdrawalRequest.findMany({
        where: { userId: actor.id },
        orderBy: { createdAt: "desc" },
        take: 20,
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
    }))

    return apiSuccess({
      earningsBalance: summary.profitEarned,
      profitBalance: summary.profitEarned,
      walletBalance: summary.profitEarned,
      availableBalance: summary.availableBalance,
      paidOut: summary.paidOut,
      lockedAmount: summary.lockedAmount,
      balanceSource: "COMPLETED_ORDER_PROFIT",
      withdrawableSource: "COMPLETED_ORDER_PROFIT",
      results,
    })
  } catch (error) {
    logApiError("[WITHDRAWALS_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function POST(req: Request) {
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) {
      return authResult
    }

    const actor = authResult.user
    if (!["AGENT", "RESELLER"].includes(actor.role)) {
      return ApiErrors.FORBIDDEN()
    }

    if (!actor.organizationId) {
      return ApiErrors.INVALID_ORGANIZATION()
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return ApiErrors.BAD_REQUEST("Invalid request body")
    }

    const amount = Number((body as { amount?: number | string }).amount)
    const noteRaw = (body as { note?: string }).note
    const note = typeof noteRaw === "string" ? noteRaw.trim() : ""

    if (!Number.isFinite(amount) || amount <= 0) {
      return ApiErrors.BAD_REQUEST("Withdrawal amount must be greater than zero")
    }

    const summary = await getUserWithdrawableSummary(actor.id)
    if (amount > summary.availableBalance) {
      return ApiErrors.BAD_REQUEST("Withdrawal amount exceeds available balance")
    }

    const created = await db.withdrawalRequest.create({
      data: {
        userId: actor.id,
        organizationId: actor.organizationId,
        amount,
        status: WITHDRAWAL_STATUS.PENDING,
        note: note || null,
        requestedByEmail: actor.email,
        requestedByRole: actor.role,
      },
    })

    await db.auditLog.create({
      data: {
        action: "WITHDRAWAL_REQUESTED",
        targetType: "WITHDRAWAL_REQUEST",
        targetId: created.id,
        organizationId: actor.organizationId,
        actorId: actor.id,
        actorName: actor.email,
        meta: JSON.stringify({
          amount: created.amount,
          role: actor.role,
        }),
      },
    })

    return apiSuccess({
      request: {
        id: created.id,
        amount: created.amount,
        status: created.status,
        note: created.note,
        requestedByEmail: created.requestedByEmail,
        requestedByRole: created.requestedByRole,
        reviewedByEmail: created.reviewedByEmail,
        reviewedAt: created.reviewedAt ? created.reviewedAt.toISOString() : null,
        createdAt: created.createdAt.toISOString(),
      },
      earningsBalance: summary.profitEarned,
      profitBalance: summary.profitEarned,
      walletBalance: summary.profitEarned,
      availableBalance: summary.availableBalance,
      paidOut: summary.paidOut,
      lockedAmount: summary.lockedAmount,
      balanceSource: "COMPLETED_ORDER_PROFIT",
      withdrawableSource: "COMPLETED_ORDER_PROFIT",
    }, undefined, 201)
  } catch (error) {
    logApiError("[WITHDRAWALS_POST]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
