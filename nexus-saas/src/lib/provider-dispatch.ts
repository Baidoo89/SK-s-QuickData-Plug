import { db } from "@/lib/db"
import { getEffectiveProviderConnection } from "@/lib/provider-connection"

export type ProviderDispatchInput = {
  orderId: string
  organizationId: string
  productId: string
  network: string
  phone: string
  quantity: number
  amount: number
  providerName: string
}

export type ProviderDispatchResult = {
  attempted: boolean
  accepted: boolean
  immediateStatus: "PENDING" | "COMPLETED" | "FAILED"
  externalRef: string | null
  message: string
}

function toSafeStatus(value: unknown): "PENDING" | "COMPLETED" | "FAILED" {
  if (value === "COMPLETED") return "COMPLETED"
  if (value === "FAILED") return "FAILED"
  return "PENDING"
}

export async function dispatchOrderToProvider(
  input: ProviderDispatchInput
): Promise<ProviderDispatchResult> {
  const providerConfig = await getEffectiveProviderConnection(input.organizationId)
  const providerOrderUrl = providerConfig.providerOrderUrl
  const providerApiKey = providerConfig.providerApiKey

  if (!providerOrderUrl) {
    await db.auditLog.create({
      data: {
        action: "ORDER_DISPATCH_SKIPPED",
        targetType: "ORDER",
        targetId: input.orderId,
        organizationId: input.organizationId,
        meta: JSON.stringify({ reason: "Missing provider order URL", provider: input.providerName }),
      },
    })

    return {
      attempted: false,
      accepted: false,
      immediateStatus: "PENDING",
      externalRef: null,
      message: "Provider URL not configured. Order kept in API queue.",
    }
  }

  try {
    const response = await fetch(providerOrderUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(providerApiKey ? { Authorization: `Bearer ${providerApiKey}` } : {}),
      },
      body: JSON.stringify({
        orderId: input.orderId,
        productId: input.productId,
        network: input.network,
        phone: input.phone,
        quantity: input.quantity,
        amount: input.amount,
      }),
    })

    const payload = await response.json().catch(() => null)
    const accepted = response.ok

    const externalRef =
      typeof payload?.externalRef === "string"
        ? payload.externalRef
        : typeof payload?.reference === "string"
          ? payload.reference
          : null

    const immediateStatus = accepted
      ? toSafeStatus(payload?.status)
      : "FAILED"

    await db.auditLog.create({
      data: {
        action: "ORDER_DISPATCH_ATTEMPT",
        targetType: "ORDER",
        targetId: input.orderId,
        organizationId: input.organizationId,
        meta: JSON.stringify({
          provider: input.providerName,
          accepted,
          httpStatus: response.status,
          externalRef,
          immediateStatus,
          payload,
        }),
      },
    })

    return {
      attempted: true,
      accepted,
      immediateStatus,
      externalRef,
      message:
        typeof payload?.message === "string"
          ? payload.message
          : accepted
            ? "Submitted to provider"
            : "Provider rejected order",
    }
  } catch (error) {
    await db.auditLog.create({
      data: {
        action: "ORDER_DISPATCH_ERROR",
        targetType: "ORDER",
        targetId: input.orderId,
        organizationId: input.organizationId,
        meta: JSON.stringify({
          provider: input.providerName,
          error: error instanceof Error ? error.message : "Unknown dispatch error",
        }),
      },
    })

    return {
      attempted: true,
      accepted: false,
      immediateStatus: "PENDING",
      externalRef: null,
      message: "Dispatch request failed. Order kept pending for retry/manual handling.",
    }
  }
}
