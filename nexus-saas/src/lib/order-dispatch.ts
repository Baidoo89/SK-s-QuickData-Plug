import { db } from "@/lib/db"
import { getEffectiveDispatchPolicy, shouldUseProviderApi } from "@/lib/dispatch-policy"
import { dispatchOrderToProvider, type ProviderDispatchResult } from "@/lib/provider-dispatch"
import { getEffectiveProviderConnection } from "@/lib/provider-connection"
import { notifyApiOrderStatus } from "@/lib/api-order-tracking"
import { reverseOrderWalletDebitIfNeeded } from "@/lib/order-wallet"

export type ResolveOrderDispatchInput = {
  orderId: string
  organizationId: string
  productId: string
  network: string
  phone: string
  quantity: number
  amount: number
}

export type ResolveOrderDispatchResult = {
  finalStatus: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | string
  dispatchMode: "API" | "MANUAL"
  dispatchProvider: string
  dispatchReason: string
  dispatchResult: ProviderDispatchResult | null
}

export async function resolveOrderDispatch(input: ResolveOrderDispatchInput): Promise<ResolveOrderDispatchResult> {
  const policy = await getEffectiveDispatchPolicy(input.organizationId)
  const decision = shouldUseProviderApi(policy, input.network)
  const providerConfig = decision.useApi
    ? await getEffectiveProviderConnection(input.organizationId)
    : null
  const canUseApi = Boolean(decision.useApi && providerConfig?.providerOrderUrl)
  const fallbackReason = "Provider connection is not configured, so this order was routed to manual fulfillment"
  const dispatchMode = canUseApi ? "API" : "MANUAL"
  const dispatchProvider = providerConfig?.providerName || decision.providerName
  const dispatchReason = decision.useApi && !canUseApi ? fallbackReason : decision.reason

  await db.auditLog.create({
    data: {
      action: "ORDER_DISPATCH_DECISION",
      targetType: "ORDER",
      targetId: input.orderId,
      organizationId: input.organizationId,
      meta: JSON.stringify({
        mode: dispatchMode,
        provider: dispatchProvider,
        reason: dispatchReason,
        network: input.network,
      }),
    },
  })

  await db.order.update({
    where: { id: input.orderId },
    data: { fulfillmentMode: dispatchMode },
    select: { id: true },
  })

  if (!canUseApi) {
    return {
      finalStatus: "PENDING",
      dispatchMode,
      dispatchProvider,
      dispatchReason,
      dispatchResult: null,
    }
  }

  const dispatchResult = await dispatchOrderToProvider({
    orderId: input.orderId,
    organizationId: input.organizationId,
    productId: input.productId,
    network: input.network,
    phone: input.phone,
    quantity: input.quantity,
    amount: input.amount,
    providerName: dispatchProvider,
  })

  let finalStatus = "PENDING"
  if (dispatchResult.immediateStatus !== "PENDING") {
    const updatedOrder = await db.order.update({
      where: { id: input.orderId },
      data: { status: dispatchResult.immediateStatus },
      select: { status: true },
    })
    finalStatus = updatedOrder.status

    if (dispatchResult.immediateStatus === "FAILED") {
      await reverseOrderWalletDebitIfNeeded({
        orderId: input.orderId,
        organizationId: input.organizationId,
        reason: "Immediate provider failure",
      })
    }

    await notifyApiOrderStatus(input.orderId, dispatchResult.immediateStatus)
  }

  return {
    finalStatus,
    dispatchMode,
    dispatchProvider,
    dispatchReason: dispatchResult.message,
    dispatchResult,
  }
}
