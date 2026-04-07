import { requireAuth, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"

interface WalletTopupResponse {
  id: string
  createdAt: string
  method: "paystack" | "manual"
  performedByEmail: string | null
  performedByRole: string | null
  beneficiaryEmail: string
  amount: number
  status: "success"
}

async function getUserByEmail(email: string) {
  if (!email) return null
  return db.user.findUnique({ where: { email } })
}

export async function GET() {
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) {
      return authResult
    }

    const user = authResult.user

    const [sum, recent] = await Promise.all([
      db.walletTransaction.aggregate({
        _sum: { amount: true },
        where: { userId: user.id, status: "success" },
      }),
      db.walletTransaction.findMany({
        where: { userId: user.id, status: "success" },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ])

    const balance = sum._sum.amount ?? 0
    const topups: WalletTopupResponse[] = (recent as any[]).map((t: any) => ({
      id: t.id,
      createdAt: t.createdAt.toISOString(),
      method: (t.method as "paystack" | "manual") ?? "manual",
      performedByEmail: t.performedByEmail ?? null,
      performedByRole: t.performedByRole ?? null,
      beneficiaryEmail: user.email ?? "",
      amount: t.amount,
      status: "success",
    }))

    return apiSuccess({ balance, topups })
  } catch (error) {
    logApiError("[AGENT_WALLET_GET]", error)
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

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return ApiErrors.BAD_REQUEST("Invalid request body")
    }

    const { method, beneficiaryEmail, amount } = body as {
      method?: "paystack" | "manual"
      beneficiaryEmail?: string
      amount?: number
    }

    if (!method || (method !== "paystack" && method !== "manual")) {
      return ApiErrors.BAD_REQUEST("Invalid top up method")
    }

    const role = actor.role
    const actorRow = await db.user.findUnique({
      where: { id: actor.id },
      select: { id: true, agentId: true, organizationId: true },
    })

    const isAgentOperator = role === "AGENT" || Boolean(actorRow?.agentId)

    if (method === "manual" && role !== "SUPERADMIN" && role !== "AGENT" && role !== "SUBSCRIBER") {
      return ApiErrors.FORBIDDEN()
    }

    const trimmedEmail = (beneficiaryEmail || "").trim()
    if (!trimmedEmail) {
      return ApiErrors.BAD_REQUEST("Beneficiary email is required")
    }

    const numericAmount = Number(amount)
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return ApiErrors.BAD_REQUEST("Amount must be greater than zero")
    }

    const beneficiary = await getUserByEmail(trimmedEmail)
    if (!beneficiary) {
      return ApiErrors.NOT_FOUND("Beneficiary user")
    }

    // Non-superadmins can only top up users within the same organization.
    if (
      role !== "SUPERADMIN" &&
      actor.organizationId &&
      beneficiary.organizationId !== actor.organizationId
    ) {
      return ApiErrors.FORBIDDEN()
    }

    if (role !== "SUPERADMIN" && isAgentOperator) {
      const sameUser = beneficiary.id === actor.id
      const ownReseller = Boolean(
        actorRow?.agentId &&
        beneficiary.role === "RESELLER" &&
        beneficiary.parentAgentId === actorRow.agentId
      )

      if (!sameUser && !ownReseller) {
        return ApiErrors.FORBIDDEN()
      }
    }

    const created = await db.walletTransaction.create({
      data: {
        userId: beneficiary.id,
        performedByEmail: actor.email,
        performedByRole: role ?? null,
        method,
        amount: numericAmount,
      },
    })

    const sum = await db.walletTransaction.aggregate({
      _sum: { amount: true },
      where: { userId: beneficiary.id, status: "success" },
    })

    const balance = sum._sum.amount ?? 0

    const topup: WalletTopupResponse = {
      id: created.id,
      createdAt: created.createdAt.toISOString(),
      method: created.method as "paystack" | "manual",
      performedByEmail: created.performedByEmail ?? null,
      performedByRole: created.performedByRole ?? null,
      beneficiaryEmail: beneficiary.email ?? "",
      amount: created.amount,
      status: "success",
    }

    return apiSuccess({ topup, balance })
  } catch (error) {
    logApiError("[AGENT_WALLET_POST]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
