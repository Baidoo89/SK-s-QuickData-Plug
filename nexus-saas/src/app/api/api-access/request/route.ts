import { randomBytes } from "crypto"
import { db } from "@/lib/db"
import { apiSuccess, ApiErrors } from "@/lib/api-response"
import { requireAuthAndOrg, isAuthError } from "@/lib/auth-guard"

function parseRequestMeta(meta: string | null) {
  if (!meta) return null
  try {
    const parsed = JSON.parse(meta) as {
      status?: string
      requestedByRole?: string
      requestedByEmail?: string
      requestedByName?: string
      issuedApiKey?: string
      approvedAt?: string
      rejectedAt?: string
      note?: string
    }
    return parsed
  } catch {
    return null
  }
}

export async function GET() {
  const authResult = await requireAuthAndOrg()
  if (isAuthError(authResult)) return authResult

  const { user } = authResult
  if (user.role !== "AGENT" && user.role !== "RESELLER") {
    return ApiErrors.FORBIDDEN()
  }

  const latest = await db.auditLog.findFirst({
    where: {
      action: "API_ACCESS_REQUEST",
      targetType: "USER",
      targetId: user.id,
      organizationId: user.organizationId!,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      meta: true,
    },
  })

  if (!latest) {
    return apiSuccess({ hasRequest: false })
  }

  const meta = parseRequestMeta(latest.meta)

  return apiSuccess({
    hasRequest: true,
    id: latest.id,
    createdAt: latest.createdAt,
    status: meta?.status ?? "PENDING",
    note: meta?.note ?? null,
    approvedAt: meta?.approvedAt ?? null,
    rejectedAt: meta?.rejectedAt ?? null,
    issuedApiKey: meta?.issuedApiKey ?? null,
  })
}

export async function POST() {
  const authResult = await requireAuthAndOrg()
  if (isAuthError(authResult)) return authResult

  const { user } = authResult
  if (user.role !== "AGENT" && user.role !== "RESELLER") {
    return ApiErrors.FORBIDDEN()
  }

  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { id: true, role: true, email: true, name: true, parentAgentId: true },
  })

  if (!dbUser?.email) {
    return ApiErrors.BAD_REQUEST("User account is missing required identity fields")
  }

  const pending = await db.auditLog.findFirst({
    where: {
      action: "API_ACCESS_REQUEST",
      targetType: "USER",
      targetId: dbUser.id,
      organizationId: user.organizationId!,
      meta: { contains: '"status":"PENDING"' },
    },
    select: { id: true },
  })

  if (pending) {
    return ApiErrors.CONFLICT("You already have a pending API access request")
  }

  const requestRef = `REQ-${randomBytes(4).toString("hex").toUpperCase()}`

  const created = await db.auditLog.create({
    data: {
      actorId: dbUser.id,
      actorName: dbUser.email,
      action: "API_ACCESS_REQUEST",
      targetType: "USER",
      targetId: dbUser.id,
      organizationId: user.organizationId!,
      meta: JSON.stringify({
        requestRef,
        status: "PENDING",
        requestedByRole: dbUser.role,
        requestedByEmail: dbUser.email,
        requestedByName: dbUser.name,
        parentAgentId: dbUser.parentAgentId,
      }),
    },
    select: { id: true, createdAt: true },
  })

  return apiSuccess(
    {
      id: created.id,
      createdAt: created.createdAt,
      status: "PENDING",
      requestRef,
    },
    "API access request submitted",
    201
  )
}
