import { requireAuth, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { getUserWithdrawableSummary } from "@/lib/withdrawal-balance"
import { canTransitionWithdrawalStatus, isWithdrawalStatus, normalizeWithdrawalStatus } from "@/lib/withdrawal-status"

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

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
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

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return ApiErrors.BAD_REQUEST("Invalid request body")
    }

    const rawStatus = String((body as { status?: string }).status || "")
    if (!isWithdrawalStatus(rawStatus)) {
      return ApiErrors.BAD_REQUEST("Invalid withdrawal status")
    }

    const status = normalizeWithdrawalStatus(rawStatus)
    const note = typeof (body as { note?: string }).note === "string" ? (body as { note?: string }).note?.trim() : ""

    const requestRow = await db.withdrawalRequest.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        userId: true,
        status: true,
        organizationId: true,
        user: {
          select: {
            role: true,
            parentAgentId: true,
          },
        },
      },
    })

    if (!requestRow) {
      return ApiErrors.NOT_FOUND("Withdrawal request")
    }

    if (
      requestRow.organizationId !== actor.organizationId ||
      requestRow.user?.role !== "RESELLER" ||
      requestRow.user?.parentAgentId !== actorAgentId
    ) {
      return ApiErrors.FORBIDDEN()
    }

    // Idempotent replay: if state already matches requested status, return success.
    if (requestRow.status === status) {
      const existing = await db.withdrawalRequest.findUnique({ where: { id: requestRow.id } })
      if (!existing) {
        return ApiErrors.NOT_FOUND("Withdrawal request")
      }

      return apiSuccess({
        withdrawal: {
          id: existing.id,
          amount: existing.amount,
          status: existing.status,
          note: existing.note,
          requestedByEmail: existing.requestedByEmail,
          requestedByRole: existing.requestedByRole,
          reviewedByEmail: existing.reviewedByEmail,
          reviewedAt: existing.reviewedAt ? existing.reviewedAt.toISOString() : null,
          createdAt: existing.createdAt.toISOString(),
          updatedAt: existing.updatedAt.toISOString(),
        },
        idempotent: true,
      })
    }

    if (!canTransitionWithdrawalStatus(requestRow.status, status)) {
      return ApiErrors.BAD_REQUEST(`Invalid transition: ${requestRow.status} -> ${status}`)
    }

    if (status === "APPROVED" || status === "PAID") {
      const requestBalance = await getUserWithdrawableSummary(requestRow.userId, {
        excludeWithdrawalRequestId: requestRow.id,
      })
      const requestAmount = await db.withdrawalRequest.findUnique({
        where: { id: requestRow.id },
        select: { amount: true },
      })

      if (!requestAmount) {
        return ApiErrors.NOT_FOUND("Withdrawal request")
      }

      if (requestAmount.amount > requestBalance.availableBalance) {
        return ApiErrors.BAD_REQUEST("This request exceeds the reseller's currently available completed-order profit.")
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
        note: note || undefined,
        reviewedByEmail: actor.email,
        reviewedAt: now,
      },
    })

    if (updateResult.count === 0) {
      const latest = await db.withdrawalRequest.findUnique({ where: { id: requestRow.id } })
      if (!latest) {
        return ApiErrors.NOT_FOUND("Withdrawal request")
      }

      if (latest.status === status) {
        return apiSuccess({
          withdrawal: {
            id: latest.id,
            amount: latest.amount,
            status: latest.status,
            note: latest.note,
            requestedByEmail: latest.requestedByEmail,
            requestedByRole: latest.requestedByRole,
            reviewedByEmail: latest.reviewedByEmail,
            reviewedAt: latest.reviewedAt ? latest.reviewedAt.toISOString() : null,
            createdAt: latest.createdAt.toISOString(),
            updatedAt: latest.updatedAt.toISOString(),
          },
          idempotent: true,
        })
      }

      return ApiErrors.BAD_REQUEST("Withdrawal request status changed by another reviewer. Refresh and retry.")
    }

    const updated = await db.withdrawalRequest.findUnique({ where: { id: requestRow.id } })
    if (!updated) {
      return ApiErrors.NOT_FOUND("Withdrawal request")
    }

    await db.auditLog.create({
      data: {
        action: "WITHDRAWAL_STATUS_CHANGED",
        targetType: "WITHDRAWAL_REQUEST",
        targetId: updated.id,
        organizationId: requestRow.organizationId,
        actorId: actor.id,
        actorName: actor.email,
        meta: JSON.stringify({
          from: requestRow.status,
          to: status,
          reviewedByEmail: actor.email,
          scope: "AGENT_REVIEW",
        }),
      },
    })

    return apiSuccess({
      withdrawal: {
        id: updated.id,
        amount: updated.amount,
        status: updated.status,
        note: updated.note,
        requestedByEmail: updated.requestedByEmail,
        requestedByRole: updated.requestedByRole,
        reviewedByEmail: updated.reviewedByEmail,
        reviewedAt: updated.reviewedAt ? updated.reviewedAt.toISOString() : null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    logApiError("[AGENT_WITHDRAWALS_PATCH]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
