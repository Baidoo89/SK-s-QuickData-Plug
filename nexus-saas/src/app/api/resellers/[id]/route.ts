import { lockWallet } from "@/lib/wallet-lock"
import { requireNoAccountHistory } from "@/lib/account-history"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors } from "@/lib/api-response"
import { z } from "zod"
import { getBaseUrl, sendSignupNotificationEmail } from "@/lib/mail"

const updateResellerSchema = z.object({
  name: z.string().min(2).optional(),
  active: z.boolean().optional(),
})

type SalesRangeKey = "daily" | "weekly" | "monthly"

function resolveSalesRange(input?: string | null): SalesRangeKey {
  if (input === "weekly" || input === "monthly") return input
  return "daily"
}

function getRangeStart(now: Date, range: SalesRangeKey): Date {
  if (range === "monthly") return new Date(now.getFullYear(), now.getMonth(), 1)
  if (range === "weekly") return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) return authResult
    const { user: authUser } = authResult

    if (authUser.role !== "AGENT") {
      return ApiErrors.FORBIDDEN()
    }

    if (!authUser.organizationId) {
      return ApiErrors.BAD_REQUEST("Agent account is not linked correctly")
    }

    const organizationId = authUser.organizationId
    const currentAgentUser = await db.user.findUnique({
      where: { id: authUser.id },
      select: { agentId: true },
    })

    if (!currentAgentUser?.agentId) {
      return ApiErrors.BAD_REQUEST("Agent account is not linked correctly")
    }

    const agentId = currentAgentUser.agentId

    const reseller = await db.user.findFirst({
      where: {
        id: params.id,
        organizationId,
        role: "RESELLER",
        parentAgentId: agentId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        createdAt: true,
      },
    })

    if (!reseller) {
      return ApiErrors.NOT_FOUND("Reseller not found")
    }

    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const { searchParams } = new URL(req.url)
    const selectedSalesRange = resolveSalesRange(searchParams.get("salesRange"))
    const salesStart = getRangeStart(now, selectedSalesRange)

    const [walletAgg, todaysOrdersCount, monthCompletedAgg, monthProfitAgg, filteredSalesAgg, filteredProfitAgg, totalProfitAgg, recentOrders] = await Promise.all([
      db.walletTransaction.aggregate({
        _sum: { amount: true },
        where: { userId: reseller.id, status: "success" },
      }),
      db.order.count({
        where: {
          organizationId,
          userId: reseller.id,
          createdAt: { gte: startOfToday },
        },
      }),
      db.order.aggregate({
        _sum: { total: true },
        where: {
          organizationId,
          userId: reseller.id,
          status: "COMPLETED",
          createdAt: { gte: startOfMonth },
        },
      }),
      db.orderItem.aggregate({
        _sum: { profit: true },
        where: {
          order: {
            organizationId,
            userId: reseller.id,
            status: "COMPLETED",
            createdAt: { gte: startOfMonth },
          },
        },
      }),
      db.order.aggregate({
        _sum: { total: true },
        where: {
          organizationId,
          userId: reseller.id,
          status: "COMPLETED",
          createdAt: { gte: salesStart },
        },
      }),
      db.orderItem.aggregate({
        _sum: { profit: true },
        where: {
          order: {
            organizationId,
            userId: reseller.id,
            status: "COMPLETED",
            createdAt: { gte: salesStart },
          },
        },
      }),
      db.orderItem.aggregate({
        _sum: { profit: true },
        where: { order: { organizationId, userId: reseller.id, status: "COMPLETED" } },
      }),
      db.order.findMany({
        where: {
          organizationId,
          userId: reseller.id,
        },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          phoneNumber: true,
          customer: { select: { phone: true } },
          status: true,
          total: true,
          createdAt: true,
        },
      }),
    ])

    return apiSuccess({
      reseller,
      metrics: {
        walletBalance: walletAgg._sum.amount ?? 0,
        todaysOrders: todaysOrdersCount,
        monthCompletedTotal: monthCompletedAgg._sum.total ?? 0,
        monthProfit: monthProfitAgg._sum.profit ?? 0,
        filteredSales: filteredSalesAgg._sum.total ?? 0,
        filteredProfit: filteredProfitAgg._sum.profit ?? 0,
        totalProfit: totalProfitAgg._sum.profit ?? 0,
        salesRange: selectedSalesRange,
      },
      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        phoneNumber: order.phoneNumber?.trim() || order.customer?.phone?.trim() || null,
        status: order.status,
        total: order.total,
        createdAt: order.createdAt,
      })),
    })
  } catch (error) {
    console.error("[RESELLER_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) return authResult
    const { user: authUser } = authResult

    if (authUser.role !== "AGENT") {
      return ApiErrors.FORBIDDEN()
    }

    if (!authUser.organizationId) {
      return ApiErrors.BAD_REQUEST("Agent account is not linked correctly")
    }

    const organizationId = authUser.organizationId
    const currentAgentUser = await db.user.findUnique({
      where: { id: authUser.id },
      select: { agentId: true },
    })

    if (!currentAgentUser?.agentId) {
      return ApiErrors.BAD_REQUEST("Agent account is not linked correctly")
    }

    const agentId = currentAgentUser.agentId

    const body = await req.json()
    const parsed = updateResellerSchema.safeParse(body)
    if (!parsed.success) return ApiErrors.VALIDATION_ERROR(parsed.error.flatten().fieldErrors)

    // Verify this reseller belongs to this agent's organization
    const reseller = await db.user.findFirst({
      where: {
        id: params.id,
        organizationId,
        role: "RESELLER",
        parentAgentId: agentId,
      },
    })

    if (!reseller) {
      return ApiErrors.NOT_FOUND("Reseller not found")
    }
    if (parsed.data.active === true && reseller.emailVerificationRequired && !reseller.emailVerified) {
      return ApiErrors.BAD_REQUEST("Email verification is required before approving this reseller.")
    }

    // Update reseller
    const updated = await db.$transaction(async tx => {
      await lockWallet(tx, params.id)
      const current = await tx.user.findFirst({ where: { id: params.id, organizationId, role: "RESELLER", parentAgentId: agentId } })
      if (!current) throw new Error("ACCOUNT_SCOPE_CHANGED")
      if (parsed.data.active === true && current.emailVerificationRequired && !current.emailVerified) throw new Error("ACCOUNT_EMAIL_UNVERIFIED")
      const changed = await tx.user.update({
      where: { id: params.id },
      data: {
        ...(parsed.data.name && { name: parsed.data.name }),
        ...(parsed.data.active !== undefined && {
          active: parsed.data.active,
          ...(parsed.data.active ? { signupStatus: "APPROVED" } : {}),
        }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        createdAt: true,
      },
    })
      if (parsed.data.active !== undefined && current.active !== parsed.data.active) await tx.auditLog.create({ data: { action: "ACCOUNT_STATUS_CHANGED", targetType: "USER", targetId: params.id, organizationId, actorId: authUser.id, actorName: authUser.email, meta: JSON.stringify({ activeBefore: current.active, activeAfter: parsed.data.active }) } })
      return changed
    })

    if (parsed.data.active === true && updated.email) {
      await sendSignupNotificationEmail({
        to: updated.email,
        subject: "Your reseller account was approved",
        title: "Reseller account approved",
        message: "Your reseller request has been approved. If your email is verified, you can now sign in to your reseller dashboard.",
        actionLabel: "Open login",
        actionHref: `${getBaseUrl()}/login`,
      }).catch(() => null)
    }

    return apiSuccess(updated, "Reseller updated")
  } catch (error) {
    if (error instanceof Error && error.message === "ACCOUNT_SCOPE_CHANGED") return ApiErrors.FORBIDDEN()
    if (error instanceof Error && error.message === "ACCOUNT_EMAIL_UNVERIFIED") return ApiErrors.BAD_REQUEST("Email verification is required before approval.")
    console.error("[RESELLER_PUT]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) return authResult
    const { user: authUser } = authResult

    if (authUser.role !== "AGENT") {
      return ApiErrors.FORBIDDEN()
    }

    if (!authUser.organizationId) {
      return ApiErrors.BAD_REQUEST("Agent account is not linked correctly")
    }

    const organizationId = authUser.organizationId
    const currentAgentUser = await db.user.findUnique({
      where: { id: authUser.id },
      select: { agentId: true },
    })

    if (!currentAgentUser?.agentId) {
      return ApiErrors.BAD_REQUEST("Agent account is not linked correctly")
    }

    const agentId = currentAgentUser.agentId

    // Verify this reseller belongs to this agent's organization
    const reseller = await db.user.findFirst({
      where: {
        id: params.id,
        organizationId,
        role: "RESELLER",
        parentAgentId: agentId,
      },
    })

    if (!reseller) {
      return ApiErrors.NOT_FOUND("Reseller not found")
    }

    // Delete reseller and their price overrides in transaction
    await db.$transaction(async (tx) => {
      await requireNoAccountHistory(tx, params.id)
      await tx.apiKey.deleteMany({ where: { ownerUserId: params.id } })
      await tx.resellerPrice.deleteMany({
        where: { resellerId: params.id, organizationId },
      })
      await tx.order.updateMany({ where: { userId: params.id }, data: { userId: null } })
      await tx.user.delete({ where: { id: params.id } })
    })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof Error && error.message === "ACCOUNT_HAS_FINANCIAL_HISTORY") return ApiErrors.BAD_REQUEST("This reseller has financial history. Deactivate the account instead; balances and debt must remain on record.")
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2003") return ApiErrors.BAD_REQUEST("This reseller still has linked records. Deactivate the account instead.")
    console.error("[RESELLER_DELETE]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
