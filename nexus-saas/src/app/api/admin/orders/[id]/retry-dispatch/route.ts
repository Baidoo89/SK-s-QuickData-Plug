import { requireOrgManager, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { dispatchOrderToProvider } from "@/lib/provider-dispatch"
import { createOrderWalletDebit, reverseOrderProfitIfNeeded, reverseOrderWalletDebitIfNeeded } from "@/lib/order-wallet"

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) {
      return authResult
    }

    const isSuperAdmin = authResult.user.role === "SUPERADMIN"
    const organizationId = authResult.user.organizationId

    const order = await db.order.findFirst({
      where: {
        id: params.id,
        ...(isSuperAdmin ? {} : { organizationId: organizationId! }),
      },
      include: {
        items: { include: { product: true } },
      },
    })

    if (!order) {
      return ApiErrors.NOT_FOUND("Order")
    }

    if (!order.organizationId) {
      return ApiErrors.BAD_REQUEST("Order is not linked to organization")
    }

    if (order.status === "COMPLETED") {
      return ApiErrors.BAD_REQUEST("Completed orders cannot be retried")
    }

    const dispatchDecisionLog = await db.auditLog.findFirst({
      where: {
        action: "ORDER_DISPATCH_DECISION",
        targetType: "ORDER",
        targetId: order.id,
      },
      orderBy: { createdAt: "desc" },
      select: { meta: true },
    })

    let dispatchMode = "MANUAL"
    let providerName = "Primary Provider"

    if (dispatchDecisionLog?.meta) {
      try {
        const parsed = JSON.parse(dispatchDecisionLog.meta)
        dispatchMode = parsed?.mode || "MANUAL"
        providerName = parsed?.provider || "Primary Provider"
      } catch {
        // keep defaults
      }
    }

    if (dispatchMode !== "API") {
      return ApiErrors.BAD_REQUEST("This order is not routed for API dispatch")
    }

    const maxAttempts = Number(process.env.DISPATCH_RETRY_MAX_ATTEMPTS || "3")
    const backoffSeconds = Number(process.env.DISPATCH_RETRY_BACKOFF_SECONDS || "30")

    const priorRetries = await db.auditLog.findMany({
      where: {
        action: "ORDER_RETRY_DISPATCH",
        targetType: "ORDER",
        targetId: order.id,
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    })

    if (priorRetries.length >= maxAttempts) {
      return ApiErrors.BAD_REQUEST(`Max retry attempts reached (${maxAttempts})`)
    }

    if (priorRetries.length > 0) {
      const lastRetryAt = priorRetries[0].createdAt.getTime()
      const nextAllowedAt = lastRetryAt + backoffSeconds * 1000
      const now = Date.now()
      if (now < nextAllowedAt) {
        const waitSeconds = Math.ceil((nextAllowedAt - now) / 1000)
        return ApiErrors.BAD_REQUEST(`Retry too soon. Try again in ${waitSeconds}s`)
      }
    }

    const firstItem = order.items[0]
    if (!firstItem) {
      return ApiErrors.BAD_REQUEST("Order has no items")
    }

    if (order.status === "FAILED") {
      if (!order.userId) {
        return ApiErrors.BAD_REQUEST("Cannot re-debit wallet for order without user")
      }

      await createOrderWalletDebit({
        orderId: order.id,
        organizationId: order.organizationId,
        userId: order.userId,
        amount: order.total,
        performedByRole: "SYSTEM",
      })

      await db.order.update({
        where: { id: order.id },
        data: { status: "PENDING" },
      })
    }

    const dispatchResult = await dispatchOrderToProvider({
      orderId: order.id,
      organizationId: order.organizationId,
      productId: firstItem.productId,
      network: firstItem.product.provider,
      phone: order.phoneNumber || "",
      quantity: firstItem.quantity,
      amount: order.total,
      providerName,
    })

    let finalStatus = "PENDING"
    if (dispatchResult.immediateStatus !== "PENDING") {
      const updated = await db.order.update({
        where: { id: order.id },
        data: { status: dispatchResult.immediateStatus },
        select: { status: true },
      })
      finalStatus = updated.status

      if (dispatchResult.immediateStatus === "FAILED") {
        await reverseOrderWalletDebitIfNeeded({
          orderId: order.id,
          organizationId: order.organizationId,
          reason: "Retry dispatch failed",
        })

        await reverseOrderProfitIfNeeded({
          orderId: order.id,
          organizationId: order.organizationId,
          previousStatus: "COMPLETED",
          reason: "Retry dispatch failed",
        })
      }
    }

    await db.auditLog.create({
      data: {
        actorId: authResult.user.id,
        actorName: authResult.user.email,
        action: "ORDER_RETRY_DISPATCH",
        targetType: "ORDER",
        targetId: order.id,
        organizationId: order.organizationId,
        meta: JSON.stringify({
          providerName,
          dispatchMessage: dispatchResult.message,
          finalStatus,
        }),
      },
    })

    return apiSuccess({
      orderId: order.id,
      status: finalStatus,
      message: dispatchResult.message,
    })
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_FUNDS") {
      return ApiErrors.BAD_REQUEST("Insufficient wallet balance for retry")
    }

    logApiError("[ADMIN_ORDER_RETRY_DISPATCH_POST]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
