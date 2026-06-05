import { randomBytes } from "crypto"
import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { apiSuccess, ApiErrors } from "@/lib/api-response"
import { requireAuthAndOrg, isAuthError } from "@/lib/auth-guard"

type RequestMeta = {
  status?: string
  requestRef?: string
  requestedByRole?: string
  requestedByEmail?: string
  requestedByName?: string
  parentAgentId?: string | null
  note?: string
  approvedAt?: string
  rejectedAt?: string
  approvedById?: string
  approvedByEmail?: string
  rejectedById?: string
  rejectedByEmail?: string
  issuedApiKey?: string
}

function parseMeta(meta: string | null): RequestMeta {
  if (!meta) return {}
  try {
    return JSON.parse(meta) as RequestMeta
  } catch {
    return {}
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuthAndOrg()
  if (isAuthError(authResult)) return authResult

  const { user } = authResult
  if (user.role !== "SUBSCRIBER" && user.role !== "SUPERADMIN" && user.role !== "AGENT") {
    return ApiErrors.FORBIDDEN()
  }

  const body = await req.json().catch(() => ({}))
  const decision = body?.decision === "REJECT" ? "REJECT" : body?.decision === "APPROVE" ? "APPROVE" : null
  const note = typeof body?.note === "string" ? body.note.trim() : ""

  if (!decision) {
    return ApiErrors.BAD_REQUEST("decision is required and must be APPROVE or REJECT")
  }

  const requestLog = await db.auditLog.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      targetId: true,
      organizationId: true,
      meta: true,
    },
  })

  if (!requestLog || requestLog.organizationId !== user.organizationId) {
    return ApiErrors.NOT_FOUND("API access request not found")
  }

  const meta = parseMeta(requestLog.meta)
  const requestedRole = meta.requestedByRole ?? ""
  const currentStatus = meta.status ?? "PENDING"

  if (currentStatus !== "PENDING") {
    return ApiErrors.CONFLICT("This API access request has already been decided")
  }

  if (user.role === "SUBSCRIBER" || user.role === "SUPERADMIN") {
    if (requestedRole !== "AGENT") {
      return ApiErrors.FORBIDDEN()
    }
  }

  if (user.role === "AGENT") {
    if (requestedRole !== "RESELLER") {
      return ApiErrors.FORBIDDEN()
    }

    const approver = await db.user.findUnique({
      where: { id: user.id },
      select: { agentId: true },
    })

    if (!approver?.agentId || meta.parentAgentId !== approver.agentId) {
      return ApiErrors.FORBIDDEN()
    }
  }

  const requester = await db.user.findUnique({
    where: { id: requestLog.targetId },
    select: { name: true, email: true },
  })

  const timestamp = new Date().toISOString()
  let updatedMeta: RequestMeta = {
    ...meta,
    note: note || meta.note,
  }

  if (decision === "APPROVE") {
    const apiKeyValue = `nk_${randomBytes(24).toString("hex")}`
    const suffix = requester?.name?.trim() || requester?.email || requestLog.targetId

    await db.apiKey.create({
      data: {
        organizationId: user.organizationId!,
        name: `API Access - ${suffix}`,
        key: apiKeyValue,
      },
    })

    updatedMeta = {
      ...updatedMeta,
      status: "APPROVED",
      approvedAt: timestamp,
      approvedById: user.id,
      approvedByEmail: user.email,
      issuedApiKey: apiKeyValue,
    }
  } else {
    updatedMeta = {
      ...updatedMeta,
      status: "REJECTED",
      rejectedAt: timestamp,
      rejectedById: user.id,
      rejectedByEmail: user.email,
    }
  }

  await db.auditLog.update({
    where: { id: requestLog.id },
    data: { meta: JSON.stringify(updatedMeta) },
  })

  await db.auditLog.create({
    data: {
      actorId: user.id,
      actorName: user.email,
      action: decision === "APPROVE" ? "API_ACCESS_APPROVED" : "API_ACCESS_REJECTED",
      targetType: "USER",
      targetId: requestLog.targetId,
      organizationId: user.organizationId!,
      meta: JSON.stringify({
        requestId: requestLog.id,
        decisionByRole: user.role,
      }),
    },
  })

  return apiSuccess({
    id: requestLog.id,
    status: updatedMeta.status,
    note: updatedMeta.note ?? null,
  })
}
