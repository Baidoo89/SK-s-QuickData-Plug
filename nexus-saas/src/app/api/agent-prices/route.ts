import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuthAndOrg, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors } from "@/lib/api-response"
import { z } from "zod"

const upsertSchema = z.object({
  agentId: z.string().min(1),
  productId: z.string().min(1),
  price: z.number().nonnegative(),
})

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const agentId = searchParams.get("agentId")

    const authResult = await requireAuthAndOrg()
    if (isAuthError(authResult)) return authResult
    const organizationId = authResult.user.organizationId!

    if (!agentId) return ApiErrors.BAD_REQUEST("agentId required")

    const prices = await db.agentPrice.findMany({
      where: { agentId, organizationId },
      select: { id: true, agentId: true, productId: true, price: true },
    })

    return apiSuccess(prices)
  } catch (error) {
    console.error("[AGENT_PRICES_GET]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const authResult = await requireAuthAndOrg()
    if (isAuthError(authResult)) return authResult
    const organizationId = authResult.user.organizationId!

    const body = await req.json()
    const parsed = upsertSchema.safeParse(body)
    if (!parsed.success) return ApiErrors.VALIDATION_ERROR(parsed.error.flatten().fieldErrors)

    const { agentId, productId, price } = parsed.data

    const agent = await db.agent.findFirst({ where: { id: agentId, organizationId } })
    if (!agent) return ApiErrors.NOT_FOUND("Agent not found")

    const product = await db.product.findFirst({ where: { id: productId, organizationId } })
    if (!product) return ApiErrors.NOT_FOUND("Product not found")

    const record = await db.agentPrice.upsert({
      where: { agentId_productId: { agentId, productId } },
      create: {
        agentId,
        productId,
        price,
        organizationId,
      },
      update: { price },
    })

    return apiSuccess(record, undefined, 201)
  } catch (error) {
    console.error("[AGENT_PRICES_POST]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}
