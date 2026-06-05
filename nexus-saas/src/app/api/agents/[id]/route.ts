import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireOrgManager, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors } from "@/lib/api-response"
import { z } from "zod"
import { getBaseUrl, sendSignupNotificationEmail } from "@/lib/mail"

const updateAgentSchema = z.object({
  name: z.string().min(2),
  active: z.boolean().optional(),
  commissionPercent: z.number().min(0).max(100).optional(),
})

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) return authResult
    const organizationId = authResult.user.organizationId!

    const body = await req.json()
    const parsed = updateAgentSchema.safeParse(body)
    if (!parsed.success) return ApiErrors.VALIDATION_ERROR(parsed.error.flatten().fieldErrors)

    const existing = await db.agent.findFirst({ where: { id: params.id, organizationId } })
    if (!existing) return ApiErrors.NOT_FOUND("Agent not found")

    const agent = await db.$transaction(async (tx) => {
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

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) return authResult
    const organizationId = authResult.user.organizationId!

    const existing = await db.agent.findFirst({ where: { id: params.id, organizationId } })
    if (!existing) return ApiErrors.NOT_FOUND("Agent not found")

    await db.$transaction(async (tx) => {
      const linkedUsers = await tx.user.findMany({
        where: { agentId: existing.id },
        select: { email: true },
      })
      await tx.agentPrice.deleteMany({ where: { agentId: existing.id, organizationId } })
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
            organizationId,
            meta: JSON.stringify({ email: user.email }),
          },
        })
      }
    })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error("[AGENT_DELETE]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}
