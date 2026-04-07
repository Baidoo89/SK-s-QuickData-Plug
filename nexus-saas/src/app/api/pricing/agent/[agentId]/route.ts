import { requireOrgManager, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { z } from "zod"

interface Params {
  params: {
    agentId: string
  }
}

const setAgentPriceSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  price: z.number().min(0, "Price must be >= 0"),
})

export async function GET(_req: Request, { params }: Params) {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) {
      return authResult
    }

    const organizationId = authResult.user.organizationId!
    const agentId = params.agentId

    // Verify agent exists in this organization
    const agent = await db.agent.findFirst({ where: { id: agentId, organizationId } })
    if (!agent) {
      return ApiErrors.NOT_FOUND("Agent")
    }

    const prices = await db.agentPrice.findMany({
      where: { agentId, organizationId },
      select: { id: true, agentId: true, productId: true, price: true, createdAt: true },
    })

    return apiSuccess(prices)
  } catch (error) {
    logApiError("[PRICING_AGENT_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) {
      return authResult
    }

    const organizationId = authResult.user.organizationId!
    const agentId = params.agentId
    const body = await req.json()
    const validation = setAgentPriceSchema.safeParse(body)

    if (!validation.success) {
      return ApiErrors.VALIDATION_ERROR(validation.error.flatten().fieldErrors)
    }

    const { productId, price } = validation.data

    // Verify agent exists
    const agent = await db.agent.findFirst({ where: { id: agentId, organizationId } })
    if (!agent) {
      return ApiErrors.NOT_FOUND("Agent")
    }

    // Verify product exists
    const product = await db.product.findFirst({ where: { id: productId, organizationId } })
    if (!product) {
      return ApiErrors.NOT_FOUND("Product")
    }

    const existingPrice = await db.agentPrice.findFirst({
      where: { agentId, productId, organizationId },
      select: { id: true },
    })

    const record = existingPrice
      ? await db.agentPrice.update({
          where: { id: existingPrice.id },
          data: { price },
        })
      : await db.agentPrice.create({
          data: { agentId, productId, price, organizationId },
        })

    return apiSuccess(record, "Agent price updated", 201)
  } catch (error) {
    logApiError("[PRICING_AGENT_POST]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
