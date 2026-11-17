import { requireAdmin, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { dispatchOrderToProvider } from "@/lib/provider-dispatch"
import { prepareOrderWalletRetry } from "@/lib/order-wallet"
import { applyProviderStatusUpdate } from "@/lib/provider-status"
import { resolveOrderRecipientPhone } from "@/lib/order-recipient"

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const authResult = await requireAdmin()
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
        customer: true,
        items: { include: { product: true } },
      },
    })

    if (!order) {
      return ApiErrors.NOT_FOUND("Order")
    }

    if (!order.organizationId) {
      return ApiErrors.BAD_REQUEST("Order is not linked to organization")
    }

    if (order.status !== "FAILED") {
      return ApiErrors.BAD_REQUEST("Only failed orders can be retried; check pending or processing orders before dispatching again")
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

    const firstItem = order.items[0]
    if (!firstItem) {
      return ApiErrors.BAD_REQUEST("Order has no items")
    }

    await prepareOrderWalletRetry({
      orderId: order.id,
      organizationId: order.organizationId,
      maxAttempts: Number.isSafeInteger(maxAttempts) && maxAttempts > 0 ? maxAttempts : 3,
      backoffSeconds: Number.isFinite(backoffSeconds) && backoffSeconds >= 0 ? backoffSeconds : 30,
      actorId: authResult.user.id,
      actorName: authResult.user.email,
    })

    const dispatchResult = await dispatchOrderToProvider({
      orderId: order.id,
      organizationId: order.organizationId,
      productId: firstItem.productId,
      network: firstItem.product.provider,
      phone: resolveOrderRecipientPhone(order),
      quantity: firstItem.quantity,
      amount: order.total,
      providerName,
    })

    const updated = await applyProviderStatusUpdate({ orderId: order.id, status: dispatchResult.immediateStatus, externalRef: dispatchResult.externalRef, source: "poll", message: dispatchResult.message })
    const finalStatus = updated?.status ?? "PENDING"

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

    if (error instanceof Error) {
      const messages: Record<string, string> = {
        WALLET_ACCOUNT_RESTRICTED: "The seller account is inactive or not approved. Review the account before retrying.",
        CREDIT_OVERDUE: "The seller has overdue credit. Clear the debt before retrying.",
        ORDER_NOT_RETRYABLE: "Order is already being retried or is no longer eligible for retry.",
        RETRY_LIMIT_REACHED: "Maximum retry attempts reached.",
        RETRY_BACKOFF: "Please wait before retrying this order again.",
        MISSING_RETRY_DEBIT: "The original wallet charge could not be verified. Review this order before retrying.",
        INVALID_WALLET_ORDER: "The wallet charge could not be verified. Review this order before retrying.",
      }
      if (messages[error.message]) return ApiErrors.BAD_REQUEST(messages[error.message])
    }
    logApiError("[ADMIN_ORDER_RETRY_DISPATCH_POST]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
