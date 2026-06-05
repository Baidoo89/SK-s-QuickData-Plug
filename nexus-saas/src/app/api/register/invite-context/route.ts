import { ApiErrors, apiSuccess } from "@/lib/api-response"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const agentId = (searchParams.get("agentId") || "").trim()

    if (!agentId) {
      return ApiErrors.BAD_REQUEST("Agent ID is required")
    }

    const agent = await db.agent.findFirst({
      where: {
        id: agentId,
        active: true,
        organization: { active: true },
      },
      select: {
        id: true,
        name: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    })

    if (!agent) {
      return ApiErrors.NOT_FOUND("Valid agent invite not found")
    }

    return apiSuccess({
      agentId: agent.id,
      agentName: agent.name,
      organizationName: agent.organization.name,
      organizationSlug: agent.organization.slug,
    })
  } catch (error) {
    console.error("[REGISTER_INVITE_CONTEXT_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
