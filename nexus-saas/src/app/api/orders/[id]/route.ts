import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuthAndOrg, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors } from "@/lib/api-response"

interface Params {
  params: {
    id: string
  }
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const authResult = await requireAuthAndOrg()
    if (isAuthError(authResult)) return authResult
    const organizationId = authResult.user.organizationId!

    const order = await db.order.findFirst({
      where: { id: params.id, organizationId },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        customer: true,
        agent: true,
      },
    })

    if (!order) {
      return ApiErrors.NOT_FOUND("Order")
    }

    return apiSuccess(order)
  } catch (error) {
    console.error("[ORDER_DETAIL_GET]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}
