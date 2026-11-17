import { requireNoAccountHistory } from "@/lib/account-history"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors } from "@/lib/api-response"
import { z } from "zod"
import { getBaseUrl, sendSignupNotificationEmail } from "@/lib/mail"

const updateAgentSchema = z.object({
  name: z.string().min(2),
  active: z.boolean().optional(),
  commissionPercent: z.number().min(0).max(100).optional(),
})

export async function PUT(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) return authResult
    if (authResult.user.role !== "SUPERADMIN" && authResult.user.role !== "SUBSCRIBER") {
      return ApiErrors.FORBIDDEN()
    }
    const organizationId = authResult.user.organizationId

    const body = await req.json()
    const parsed = updateAgentSchema.safeParse(body)
    if (!parsed.success) return ApiErrors.VALIDATION_ERROR(parsed.error.flatten().fieldErrors)

    const existing = await db.agent.findFirst({
      where: {
        id: params.id,
        ...(authResult.user.role === "SUPERADMIN" ? {} : { organizationId: organizationId ?? "" }),
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            emailVerified: true,
            emailVerificationRequired: true,
          },
        },
      },
    })
    if (!existing) return ApiErrors.NOT_FOUND("Agent not found")
    if (parsed.data.active === true && existing.user?.emailVerificationRequired && !existing.user.emailVerified) {
      return ApiErrors.BAD_REQUEST("Email verification is required before approving this agent.")
    }

    const agent = await db.$transaction(async (tx) => {
      const prior = await tx.$queryRaw<Array<{ active: boolean }>>`SELECT "active" FROM "Agent" WHERE "id" = ${existing.id} FOR NO KEY UPDATE`
      const updatedAgent = await tx.agent.update({
        where: { id: existing.id },
        data: {
          name: parsed.data.name,
          ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
          ...(parsed.data.commissionPercent !== undefined
            ? { commissionPercent: parsed.data.commissionPercent }
            : {}),
        },
      })

      if (parsed.data.active !== undefined) {
        const userData: { active: boolean; signupStatus?: string } = { active: parsed.data.active }
        if (parsed.data.active) {
          userData.signupStatus = "APPROVED"
        }

        await tx.user.updateMany({
        where: { agentId: existing.id },
        data: userData,
      })

      }

      if (parsed.data.active !== undefined && prior[0]?.active !== parsed.data.active) await tx.auditLog.create({ data: { action: "ACCOUNT_STATUS_CHANGED", targetType: "AGENT", targetId: existing.id, organizationId: existing.organizationId, actorId: authResult.user.id, actorName: authResult.user.email, meta: JSON.stringify({ activeBefore: prior[0]?.active, activeAfter: parsed.data.active }) } })
      return updatedAgent
    })

    if (parsed.data.active === true) {
      const linkedUser = await db.user.findFirst({
        where: { agentId: existing.id },
        select: { email: true },
      })
      if (linkedUser?.email) {
        await sendSignupNotificationEmail({
          to: linkedUser.email,
          subject: "Your agent account was approved",
          title: "Agent account approved",
          message: "Your agent request has been approved. If your email is verified, you can now sign in to your agent dashboard.",
          actionLabel: "Open login",
          actionHref: `${getBaseUrl()}/login`,
        }).catch(() => null)
      }
    }

    return apiSuccess(agent)
  } catch (error) {
    console.error("[AGENT_PUT]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) return authResult
    if (authResult.user.role !== "SUPERADMIN" && authResult.user.role !== "SUBSCRIBER") {
      return ApiErrors.FORBIDDEN()
    }
    const organizationId = authResult.user.organizationId

    const existing = await db.agent.findFirst({
      where: {
        id: params.id,
        ...(authResult.user.role === "SUPERADMIN" ? {} : { organizationId: organizationId ?? "" }),
      },
    })
    if (!existing) return ApiErrors.NOT_FOUND("Agent not found")

    await db.$transaction(async (tx) => {
      const linkedUsers = await tx.user.findMany({
        where: { agentId: existing.id },
        select: { id: true, email: true },
        orderBy: { id: "asc" },
      })
      for (const user of linkedUsers) await requireNoAccountHistory(tx, user.id)
      const dependentCount = (await tx.order.count({ where: { OR: [{ agentId: existing.id }, { sellerAgentId: existing.id }] } })) + (await tx.customer.count({ where: { agentId: existing.id } })) + (await tx.user.count({ where: { parentAgentId: existing.id } })) + (await tx.serviceRequest.count({ where: { agentId: existing.id } }))
      if (dependentCount > 0) throw new Error("ACCOUNT_HAS_FINANCIAL_HISTORY")
      await tx.apiKey.deleteMany({ where: { OR: [{ ownerAgentId: existing.id }, { ownerUserId: { in: linkedUsers.map(user => user.id) } }] } })
      await tx.agentPrice.deleteMany({ where: { agentId: existing.id, organizationId: existing.organizationId } })
      await tx.order.updateMany({ where: { agentId: existing.id }, data: { agentId: null } })
      await tx.user.deleteMany({ where: { agentId: existing.id } })
      await tx.agent.delete({ where: { id: existing.id } })

      for (const user of linkedUsers) {
        if (!user.email) continue
        await tx.auditLog.create({
          data: {
            action: "AGENT_SIGNUP_REJECTED",
            targetType: "USER",
            targetId: user.email,
            organizationId: existing.organizationId,
            meta: JSON.stringify({ email: user.email }),
          },
        })
      }
    })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof Error && error.message === "ACCOUNT_HAS_FINANCIAL_HISTORY") return ApiErrors.BAD_REQUEST("This agent has linked or financial history. Deactivate the account instead; balances and debt must remain on record.")
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2003") return ApiErrors.BAD_REQUEST("This agent still has linked records. Deactivate the account instead.")
    console.error("[AGENT_DELETE]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}
