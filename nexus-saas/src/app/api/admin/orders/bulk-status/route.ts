import { applyManualOrderStatus } from "@/lib/manual-order-status"
import { requireAdmin, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { z } from "zod"

const schema = z.object({
  orderIds: z.array(z.string().min(1)).min(1),
  status: z.enum(["PENDING", "COMPLETED", "FAILED"]),
})

export async function POST(req: Request) {
  try {
    const authResult = await requireAdmin()
    if (isAuthError(authResult)) {
      return authResult
    }

    const isSuperAdmin = authResult.user.role === "SUPERADMIN"
    const organizationId = authResult.user.organizationId

    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return ApiErrors.VALIDATION_ERROR(parsed.error.flatten().fieldErrors)
    }

    const uniqueIds = Array.from(new Set(parsed.data.orderIds))

    const orders = await db.order.findMany({ where: { id: { in: uniqueIds }, ...(isSuperAdmin ? {} : { organizationId: organizationId! }) }, select: { id: true, organizationId: true } })
    let updatedCount = 0
    for (const order of orders) {
      const saved = await applyManualOrderStatus({ orderId: order.id, organizationId: order.organizationId, status: parsed.data.status, actorId: authResult.user.id, actorName: authResult.user.email, action: "ORDER_BULK_MANUAL_STATUS", expectedStatuses: ["PENDING", "PROCESSING"], manualOnly: true })
      if (saved) updatedCount++
    }

    return apiSuccess({
      updatedCount,
      status: parsed.data.status,
    })
  } catch (error) {
    logApiError("[ADMIN_BULK_ORDER_STATUS_POST]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
