import { requireOrgManager, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { sendPasswordResetEmail, getBaseUrl } from "@/lib/mail"
import { z } from "zod"
import { randomUUID } from "crypto"

const createAgentSchema = z.object({
  name: z.string().min(2, "Agent name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  commissionPercent: z.number().min(0).max(100).optional().default(0),
})

export async function GET() {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) {
      return authResult
    }

    const organizationId = authResult.user.organizationId!

    const agents = await db.agent.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    })

    const statsMap = new Map<string, any>()

    const agentIds = agents.map((a) => a.id)
    if (agentIds.length > 0) {
      const stats = await db.order.groupBy({
        by: ["agentId"],
        where: { organizationId, agentId: { in: agentIds } },
        _count: { _all: true },
        _sum: { total: true },
      })

      const profitRows = await db.orderItem.findMany({
        where: {
          order: { organizationId, agentId: { in: agentIds } },
        },
        select: { profit: true, order: { select: { agentId: true } } },
      })

      for (const row of stats) {
        if (!row.agentId) continue
        statsMap.set(row.agentId, {
          totalOrders: row._count._all,
          totalRevenue: row._sum.total ?? 0,
          totalProfit: 0,
        })
      }

      for (const row of profitRows) {
        const agentId = row.order.agentId
        if (!agentId) continue
        const existing = statsMap.get(agentId) ?? { totalOrders: 0, totalRevenue: 0, totalProfit: 0 }
        existing.totalProfit += row.profit
        statsMap.set(agentId, existing)
      }
    }

    const payload = agents.map((agent) => {
      const s = statsMap.get(agent.id)
      const totalProfit = s?.totalProfit ?? 0
      const commissionRate = (agent.commissionPercent ?? 0) / 100
      const estimatedCommission = totalProfit * commissionRate

      return {
        ...agent,
        totalOrders: s?.totalOrders ?? 0,
        totalRevenue: s?.totalRevenue ?? 0,
        totalProfit,
        estimatedCommission,
      }
    })

    return apiSuccess(payload)
  } catch (error) {
    logApiError("[AGENTS_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function POST(req: Request) {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) {
      return authResult
    }

    const organizationId = authResult.user.organizationId!
    const body = await req.json()
    const parsed = createAgentSchema.safeParse(body)

    if (!parsed.success) {
      return ApiErrors.VALIDATION_ERROR(parsed.error.flatten().fieldErrors)
    }

    const { name, email, commissionPercent } = parsed.data
    const normalizedEmail = email.trim().toLowerCase()

    // Check if agent already exists with this email
    const existingUserWithEmail = await db.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
    })
    if (existingUserWithEmail?.agentId) {
      return ApiErrors.CONFLICT("An agent with this email already exists")
    }

    // Create the Agent record
    const agent = await db.agent.create({
      data: {
        name,
        organizationId,
        commissionPercent,
      },
    })

    // Create or reuse a User account for this agent email
    let user = await db.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
    })

    if (!user) {
      user = await db.user.create({
        data: {
          name,
          email: normalizedEmail,
          role: "AGENT",
          agentId: agent.id,
          organizationId,
        },
      })
    } else {
      user = await db.user.update({
        where: { id: user.id },
        data: {
          role: "AGENT",
          agentId: agent.id,
          organizationId,
          email: normalizedEmail,
        },
      })
    }

    // Generate invite token
    const token = randomUUID()
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)

    await db.passwordResetToken.create({
      data: { email: normalizedEmail, token, expires },
    })

    const baseUrl = getBaseUrl()
    const inviteUrl = `${baseUrl}/new-password?token=${token}`

    // Send password reset email to agent
    try {
      await sendPasswordResetEmail(normalizedEmail, token)
    } catch (emailError) {
      logApiError("[AGENT_EMAIL_SEND]", emailError)
      // Continue even if email fails - the link is still available in the UI
    }

    return apiSuccess({ agent, inviteUrl }, "Agent created successfully. Invitation email sent.", 201)
  } catch (error) {
    logApiError("[AGENTS_POST]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
