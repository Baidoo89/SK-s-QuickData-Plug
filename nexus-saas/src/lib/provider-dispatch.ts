import { db } from "@/lib/db"
import { getDispatchProviderConnection } from "@/lib/provider-connection"

export type ProviderDispatchInput = {
  orderId: string
  organizationId: string
  productId: string
  network: string
  phone: string
  quantity: number
  amount: number
  providerKey?: string
  providerName: string
}

export type ProviderDispatchResult = {
  attempted: boolean
  accepted: boolean
  immediateStatus: "PENDING" | "COMPLETED" | "FAILED"
  externalRef: string | null
  message: string
  retryable: boolean
  httpStatus?: number
  providerKey?: string
  providerName?: string
}

function toSafeStatus(value: unknown): "PENDING" | "COMPLETED" | "FAILED" {
  if (value === "COMPLETED") return "COMPLETED"
  if (value === "FAILED") return "FAILED"
  return "PENDING"
}

export async function dispatchOrderToProvider(
  input: ProviderDispatchInput
): Promise<ProviderDispatchResult> {
  const providerConfig = await getDispatchProviderConnection(input.organizationId, input.providerKey || "primary")

  if (!providerConfig) {
    await db.auditLog.create({
      data: {
        action: "ORDER_DISPATCH_SKIPPED",
        targetType: "ORDER",
        targetId: input.orderId,
        organizationId: input.organizationId,
        meta: JSON.stringify({
          reason: "Provider slot is not configured or inactive",
          providerKey: input.providerKey || "primary",
          provider: input.providerName,
        }),
      },
    })

    return {
      attempted: false,
      accepted: false,
      immediateStatus: "PENDING",
      externalRef: null,
      message: "Provider slot is not configured or inactive. Order kept pending for manual handling.",
      retryable: true,
      providerKey: input.providerKey || "primary",
      providerName: input.providerName,
    }
  }

  const providerOrderUrl = providerConfig.providerOrderUrl
  const providerApiKey = providerConfig.providerApiKey
  const providerName = providerConfig.providerName || input.providerName

  if (!providerOrderUrl) {
    await db.auditLog.create({
      data: {
        action: "ORDER_DISPATCH_SKIPPED",
        targetType: "ORDER",
        targetId: input.orderId,
        organizationId: input.organizationId,
        meta: JSON.stringify({ reason: "Missing provider order URL", providerKey: providerConfig.providerKey, provider: providerName }),
      },
    })

    return {
      attempted: false,
      accepted: false,
      immediateStatus: "PENDING",
      externalRef: null,
      message: "Provider URL not configured. Order kept pending for manual handling.",
      retryable: true,
      providerKey: providerConfig.providerKey,
      providerName,
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
    const retryable = !accepted && (response.status === 429 || response.status >= 500)

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
          provider: providerName,
          providerKey: providerConfig.providerKey,
          accepted,
          httpStatus: response.status,
          externalRef,
          immediateStatus,
          retryable,
          payload,
        }),
      },
    })

    return {
      attempted: true,
      accepted,
      immediateStatus,
      externalRef,
      retryable,
      httpStatus: response.status,
      providerKey: providerConfig.providerKey,
      providerName,
      message:
        typeof payload?.message === "string"
          ? payload.message
          : accepted
            ? "Submitted to provider"
            : retryable
              ? "Provider temporarily failed"
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
          provider: providerName,
          providerKey: providerConfig.providerKey,
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
      retryable: true,
      providerKey: providerConfig.providerKey,
      providerName,
    }
  }
}
