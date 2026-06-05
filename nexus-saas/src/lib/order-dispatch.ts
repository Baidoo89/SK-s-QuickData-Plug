import { db } from "@/lib/db"
import { getEffectiveDispatchPolicy, shouldUseProviderApi } from "@/lib/dispatch-policy"
import { dispatchOrderToProvider, type ProviderDispatchResult } from "@/lib/provider-dispatch"
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
  const providerKeys = Array.isArray(decision.providerKeys) && decision.providerKeys.length > 0
    ? decision.providerKeys
    : [decision.providerKey || "primary"]
  const initialDispatchMode = decision.useApi ? "API" : "MANUAL"

  await db.auditLog.create({
    data: {
      action: "ORDER_DISPATCH_DECISION",
      targetType: "ORDER",
      targetId: input.orderId,
      organizationId: input.organizationId,
      meta: JSON.stringify({
        mode: initialDispatchMode,
        providerKey: decision.providerKey,
        providerKeys,
        provider: decision.providerName,
        reason: decision.reason,
        network: input.network,
      }),
    },
  })

  await db.order.update({
    where: { id: input.orderId },
    data: { fulfillmentMode: initialDispatchMode },
    select: { id: true },
  })

  if (!decision.useApi) {
    return {
      finalStatus: "PENDING",
      dispatchMode: "MANUAL",
      dispatchProvider: decision.providerName,
      dispatchReason: decision.reason,
      dispatchResult: null,
    }
  }

  let dispatchResult: ProviderDispatchResult | null = null
  let dispatchProvider = decision.providerName
  const attemptedProviders: Array<{ providerKey: string; message: string; retryable: boolean; accepted: boolean }> = []

  for (const providerKey of providerKeys) {
    const result = await dispatchOrderToProvider({
      orderId: input.orderId,
      organizationId: input.organizationId,
      productId: input.productId,
      network: input.network,
      phone: input.phone,
      quantity: input.quantity,
      amount: input.amount,
      providerKey,
      providerName: decision.providerName,
    })

    dispatchResult = result
    dispatchProvider = result.providerName || decision.providerName
    attemptedProviders.push({
      providerKey: result.providerKey || providerKey,
      message: result.message,
      retryable: result.retryable,
      accepted: result.accepted,
    })

    if (result.accepted || !result.retryable) {
      break
    }
  }

  if (!dispatchResult || (!dispatchResult.accepted && dispatchResult.retryable)) {
    const dispatchReason = dispatchResult?.message || "No provider connection is available"

    await db.order.update({
      where: { id: input.orderId },
      data: { fulfillmentMode: "MANUAL", status: "PENDING" },
      select: { id: true },
    })

    await db.auditLog.create({
      data: {
        action: "ORDER_DISPATCH_MANUAL_FALLBACK",
        targetType: "ORDER",
        targetId: input.orderId,
        organizationId: input.organizationId,
        meta: JSON.stringify({
          reason: dispatchReason,
          providerKeys,
          attemptedProviders,
          network: input.network,
        }),
      },
    })

    return {
      finalStatus: "PENDING",
      dispatchMode: "MANUAL",
      dispatchProvider,
      dispatchReason,
      dispatchResult,
    }
  }

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
    dispatchMode: "API",
    dispatchProvider,
    dispatchReason: dispatchResult.message,
    dispatchResult,
  }
}
