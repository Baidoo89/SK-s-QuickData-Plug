import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth, isAuthError } from "@/lib/auth-guard"
import { apiSuccess } from "@/lib/api-response"

export async function GET(req: Request) {
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) return authResult
    const user = authResult.user

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "10")
    const skip = (page - 1) * pageSize

    const [items, total] = await Promise.all([
      db.order.findMany({
        where: { organizationId: user.organizationId! },
        include: { customer: true, agent: true, items: { include: { product: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      db.order.count({ where: { organizationId: user.organizationId! } }),
    ])

    return apiSuccess({ items, total, page, pageSize })
  } catch (error) {
    console.error("[AGENT_ORDERS_GET]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}
