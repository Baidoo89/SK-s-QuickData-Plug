import { z } from "zod"

import { requireOrgManager, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { resolveOrderDispatch } from "@/lib/order-dispatch"
import { resolveOrderRecipientPhone } from "@/lib/order-recipient"

const schema = z.object({
  orderIds: z.array(z.string().min(1)).min(1).max(100),
})

const ELIGIBLE_STATUSES = new Set(["PENDING", "PROCESSING"])

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

    const orders = await db.order.findMany({
      where: {
        id: { in: uniqueIds },
        ...(isSuperAdmin ? {} : { organizationId: organizationId! }),
      },
      include: {
        customer: true,
        items: {
          include: { product: true },
        },
      },
    })

    let sentToApi = 0
    let stayedManual = 0
    let skipped = uniqueIds.length - orders.length
    const results: Array<{ orderId: string; status: string; mode?: string; reason?: string }> = []

    for (const order of orders) {
      const firstItem = order.items[0]
      const recipientPhone = resolveOrderRecipientPhone(order)

      if (
        !ELIGIBLE_STATUSES.has(order.status) ||
        order.paymentStatus !== "PAID" ||
        order.fulfillmentMode !== "MANUAL" ||
        !order.organizationId ||
        !recipientPhone ||
        order.items.length !== 1 ||
        !firstItem?.product
      ) {
        skipped += 1
        results.push({ orderId: order.id, status: "SKIPPED", reason: "Order is not eligible for API dispatch" })
        continue
      }

      const dispatch = await resolveOrderDispatch({
        orderId: order.id,
        organizationId: order.organizationId!,
        productId: firstItem.productId,
        network: firstItem.product.provider,
        phone: recipientPhone,
        quantity: firstItem.quantity,
        amount: order.total,
      })

      if (dispatch.dispatchMode === "API") {
        sentToApi += 1
      } else {
        stayedManual += 1
      }

      results.push({
        orderId: order.id,
        status: dispatch.finalStatus,
        mode: dispatch.dispatchMode,
        reason: dispatch.dispatchReason,
      })

      await db.auditLog.create({
        data: {
          actorId: authResult.user.id,
          actorName: authResult.user.email,
          action: "ORDER_BULK_API_DISPATCH",
          targetType: "ORDER",
          targetId: order.id,
          organizationId: order.organizationId,
          meta: JSON.stringify({
            finalStatus: dispatch.finalStatus,
            dispatchMode: dispatch.dispatchMode,
            dispatchProvider: dispatch.dispatchProvider,
            dispatchReason: dispatch.dispatchReason,
          }),
        },
      })
    }

    return apiSuccess({
      sentToApi,
      stayedManual,
      skipped,
      results,
    })
  } catch (error) {
    logApiError("[DASHBOARD_BULK_DISPATCH_POST]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
