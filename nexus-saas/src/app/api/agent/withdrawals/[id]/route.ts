import { requireAuth, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { updateWithdrawalRequest } from "@/lib/withdrawal-review"
import { isWithdrawalStatus, normalizeWithdrawalStatus } from "@/lib/withdrawal-status"

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

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

    const result = await updateWithdrawalRequest({ requestId: params.id, actor, organizationId: actor.organizationId ?? undefined, status, note, requesterRole: "RESELLER", parentAgentId: actorAgentId })
    if (!result.ok) {
      if (result.code === "NOT_FOUND") return ApiErrors.NOT_FOUND("Withdrawal request")
      if (result.code === "FORBIDDEN") return ApiErrors.FORBIDDEN()
      if (result.code === "INSUFFICIENT_EARNINGS") return ApiErrors.BAD_REQUEST("This request exceeds currently available completed-order profit.")
      return ApiErrors.BAD_REQUEST("Withdrawal status changed or the transition is invalid. Refresh and retry.")
    }
    return apiSuccess({ withdrawal: result.withdrawal, idempotent: result.idempotent })
  } catch (error) {
    logApiError("[AGENT_WITHDRAWALS_PATCH]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
