import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors } from "@/lib/api-response"
import { z } from "zod"

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

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) return authResult
    const { user: authUser } = authResult

    if (!authUser.organizationId) {
      return ApiErrors.BAD_REQUEST("User not linked to organization")
    }

    const organizationId = authUser.organizationId

    const fullUser = await db.user.findUnique({
      where: { id: authUser.id },
      select: { agentId: true },
    })

    let agentId = fullUser?.agentId ?? null
    if (!agentId) {
      const candidates = await db.agent.findMany({
        where: { organizationId },
        select: { id: true },
        take: 2,
      })

      if (candidates.length === 1) {
        agentId = candidates[0].id
        await db.user.update({ where: { id: authUser.id }, data: { agentId, role: "AGENT" } })
      } else {
        return ApiErrors.BAD_REQUEST("Agent profile not linked to this account. Ask admin to relink your agent login.")
      }
    }

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

    const [walletAgg, todaysOrdersCount, monthCompletedAgg, monthProfitAgg, filteredSalesAgg, filteredProfitAgg, recentOrders] = await Promise.all([
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
        salesRange: selectedSalesRange,
      },
      recentOrders,
    })
  } catch (error) {
    console.error("[RESELLER_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) return authResult
    const { user: authUser } = authResult

    if (!authUser.organizationId) {
      return ApiErrors.BAD_REQUEST("User not linked to organization")
    }

    const organizationId = authUser.organizationId

    const fullUser = await db.user.findUnique({
      where: { id: authUser.id },
      select: { agentId: true },
    })

    let agentId = fullUser?.agentId ?? null
    if (!agentId) {
      const candidates = await db.agent.findMany({
        where: { organizationId },
        select: { id: true },
        take: 2,
      })

      if (candidates.length === 1) {
        agentId = candidates[0].id
        await db.user.update({ where: { id: authUser.id }, data: { agentId, role: "AGENT" } })
      } else {
        return ApiErrors.BAD_REQUEST("Agent profile not linked to this account. Ask admin to relink your agent login.")
      }
    }

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

    // Update reseller
    const updated = await db.user.update({
      where: { id: params.id },
      data: {
        ...(parsed.data.name && { name: parsed.data.name }),
        ...(parsed.data.active !== undefined && { active: parsed.data.active }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        createdAt: true,
      },
    })

    return apiSuccess(updated, "Reseller updated")
  } catch (error) {
    console.error("[RESELLER_PUT]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) return authResult
    const { user: authUser } = authResult

    if (!authUser.organizationId) {
      return ApiErrors.BAD_REQUEST("User not linked to organization")
    }

    const organizationId = authUser.organizationId
    const fullUser = await db.user.findUnique({
      where: { id: authUser.id },
      select: { agentId: true },
    })

    let agentId = fullUser?.agentId ?? null
    if (!agentId) {
      const candidates = await db.agent.findMany({
        where: { organizationId },
        select: { id: true },
        take: 2,
      })

      if (candidates.length === 1) {
        agentId = candidates[0].id
        await db.user.update({ where: { id: authUser.id }, data: { agentId, role: "AGENT" } })
      } else {
        return ApiErrors.BAD_REQUEST("Agent profile not linked to this account. Ask admin to relink your agent login.")
      }
    }

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
      await tx.resellerPrice.deleteMany({
        where: { resellerId: params.id, organizationId },
      })
      await tx.order.updateMany({ where: { userId: params.id }, data: { userId: null } })
      await tx.user.delete({ where: { id: params.id } })
    })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error("[RESELLER_DELETE]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
