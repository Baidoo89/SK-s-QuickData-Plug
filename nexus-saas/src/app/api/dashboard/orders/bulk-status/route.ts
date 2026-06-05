import { z } from "zod"

import { requireOrgManager, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { notifyApiOrderStatus } from "@/lib/api-order-tracking"
import { db } from "@/lib/db"
import { reverseOrderProfitIfNeeded, reverseOrderWalletDebitIfNeeded } from "@/lib/order-wallet"

const schema = z.object({
  orderIds: z.array(z.string().min(1)).min(1).max(200),
  status: z.enum(["PROCESSING", "COMPLETED", "FAILED", "CANCELLED", "REFUNDED"]),
})

const REVERSAL_STATUSES = new Set(["FAILED", "CANCELLED", "REFUNDED"])
const ALLOWED_CURRENT_STATUSES = new Set(["PENDING", "PROCESSING"])

export async function POST(req: Request) {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) return authResult

    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return ApiErrors.VALIDATION_ERROR(parsed.error.flatten().fieldErrors)
    }

    const isSuperAdmin = authResult.user.role === "SUPERADMIN"
    const organizationId = authResult.user.organizationId
    const uniqueIds = Array.from(new Set(parsed.data.orderIds))

    const existingOrders = await db.order.findMany({
      where: {
        id: { in: uniqueIds },
        ...(isSuperAdmin ? {} : { organizationId: organizationId! }),
      },
      select: { id: true, organizationId: true, status: true, paymentStatus: true, fulfillmentMode: true },
    })

    let updated = 0
    let skipped = 0

    for (const order of existingOrders) {
      if (!ALLOWED_CURRENT_STATUSES.has(order.status)) {
        skipped += 1
        continue
      }

      if (order.paymentStatus !== "PAID" || order.fulfillmentMode !== "MANUAL") {
        skipped += 1
        continue
      }

      if (parsed.data.status === "PROCESSING" && order.status !== "PENDING") {
        skipped += 1
        continue
      }

      await db.order.update({
        where: { id: order.id },
        data: { status: parsed.data.status },
      })

      if (REVERSAL_STATUSES.has(parsed.data.status)) {
        await reverseOrderWalletDebitIfNeeded({
          orderId: order.id,
          organizationId: order.organizationId,
          reason: `Bulk manual action marked ${parsed.data.status.toLowerCase()}`,
        })

        await reverseOrderProfitIfNeeded({
          orderId: order.id,
          organizationId: order.organizationId,
          previousStatus: order.status,
          reason: `Bulk manual action marked ${parsed.data.status.toLowerCase()}`,
        })
      }

      await db.auditLog.create({
        data: {
          actorId: authResult.user.id,
          actorName: authResult.user.email,
          action: "ORDER_BULK_MANUAL_STATUS",
          targetType: "ORDER",
          targetId: order.id,
          organizationId: order.organizationId,
          meta: JSON.stringify({
            previousStatus: order.status,
            status: parsed.data.status,
          }),
        },
      })

      await notifyApiOrderStatus(order.id, parsed.data.status)
      updated += 1
    }

    skipped += uniqueIds.length - existingOrders.length

    return apiSuccess({ updated, skipped })
  } catch (error) {
    logApiError("[DASHBOARD_BULK_ORDER_STATUS_POST]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
