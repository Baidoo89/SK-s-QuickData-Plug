import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuthAndOrg, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors } from "@/lib/api-response"
import { z } from "zod"

const updateAgentSchema = z.object({
  name: z.string().min(2),
  active: z.boolean().optional(),
  commissionPercent: z.number().min(0).max(100).optional(),
})

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const authResult = await requireAuthAndOrg()
    if (isAuthError(authResult)) return authResult
    const organizationId = authResult.user.organizationId!

    const body = await req.json()
    const parsed = updateAgentSchema.safeParse(body)
    if (!parsed.success) return ApiErrors.VALIDATION_ERROR(parsed.error.flatten().fieldErrors)

    const existing = await db.agent.findFirst({ where: { id: params.id, organizationId } })
    if (!existing) return ApiErrors.NOT_FOUND("Agent not found")

    const agent = await db.agent.update({
      where: { id: existing.id },
      data: {
        name: parsed.data.name,
        ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
        ...(parsed.data.commissionPercent !== undefined
          ? { commissionPercent: parsed.data.commissionPercent }
          : {}),
      },
    })

    return apiSuccess(agent)
  } catch (error) {
    console.error("[AGENT_PUT]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const authResult = await requireAuthAndOrg()
    if (isAuthError(authResult)) return authResult
    const organizationId = authResult.user.organizationId!

    const existing = await db.agent.findFirst({ where: { id: params.id, organizationId } })
    if (!existing) return ApiErrors.NOT_FOUND("Agent not found")

    await db.$transaction(async (tx) => {
      await tx.agentPrice.deleteMany({ where: { agentId: existing.id, organizationId } })
      await tx.order.updateMany({ where: { agentId: existing.id }, data: { agentId: null } })
      await tx.agent.delete({ where: { id: existing.id } })
    })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error("[AGENT_DELETE]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}
