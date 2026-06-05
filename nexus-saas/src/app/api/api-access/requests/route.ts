import { db } from "@/lib/db"
import { apiSuccess, ApiErrors } from "@/lib/api-response"
import { requireAuthAndOrg, isAuthError } from "@/lib/auth-guard"

export const dynamic = "force-dynamic"

type RequestMeta = {
  status?: string
  requestedByRole?: string
  requestedByEmail?: string
  requestedByName?: string
  parentAgentId?: string | null
  note?: string
}

function parseMeta(meta: string | null): RequestMeta {
  if (!meta) return {}
  try {
    return JSON.parse(meta) as RequestMeta
  } catch {
    return {}
  }
}

export async function GET() {
  const authResult = await requireAuthAndOrg()
  if (isAuthError(authResult)) return authResult

  const { user } = authResult

  if (user.role !== "SUBSCRIBER" && user.role !== "SUPERADMIN" && user.role !== "AGENT") {
    return ApiErrors.FORBIDDEN()
  }

  const baseWhere = {
    action: "API_ACCESS_REQUEST",
    targetType: "USER",
    organizationId: user.organizationId!,
    meta: { contains: '"status":"PENDING"' },
  } as const

  const rawRequests = await db.auditLog.findMany({
    where: baseWhere,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      targetId: true,
      createdAt: true,
      meta: true,
    },
  })

  let agentId: string | null = null
  if (user.role === "AGENT") {
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: { agentId: true },
    })
    agentId = dbUser?.agentId ?? null
    if (!agentId) {
      return ApiErrors.BAD_REQUEST("Agent account is not linked correctly")
    }
  }

  const scopedRequests = rawRequests
    .map((req) => ({ ...req, parsedMeta: parseMeta(req.meta) }))
    .filter((req) => {
      if (user.role === "SUBSCRIBER" || user.role === "SUPERADMIN") {
        return req.parsedMeta.requestedByRole === "AGENT"
      }

      return (
        req.parsedMeta.requestedByRole === "RESELLER" &&
        req.parsedMeta.parentAgentId === agentId
      )
    })

  const requesterIds = scopedRequests.map((req) => req.targetId)
  const requesters = requesterIds.length
    ? await db.user.findMany({
        where: { id: { in: requesterIds } },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          parentAgent: { select: { id: true, name: true } },
        },
      })
    : []

  const byId = new Map(requesters.map((r) => [r.id, r]))

  const data = scopedRequests.map((req) => {
    const requester = byId.get(req.targetId)
    return {
      id: req.id,
      createdAt: req.createdAt,
      status: req.parsedMeta.status ?? "PENDING",
      note: req.parsedMeta.note ?? null,
      requester: {
        id: req.targetId,
        name: requester?.name ?? req.parsedMeta.requestedByName ?? "Unknown",
        email: requester?.email ?? req.parsedMeta.requestedByEmail ?? "-",
        role: requester?.role ?? req.parsedMeta.requestedByRole ?? "UNKNOWN",
        parentAgentName: requester?.parentAgent?.name ?? null,
      },
    }
  })

  return apiSuccess({ requests: data })
}
