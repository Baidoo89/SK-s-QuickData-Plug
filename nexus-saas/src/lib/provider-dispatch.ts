import { db } from "@/lib/db"
import { getDispatchProviderConnection } from "@/lib/provider-connection"
import {
  buildProviderAuthHeaders,
  getProviderProductMapping,
  getProviderTemplate,
  readProviderMessage,
  readProviderReference,
  readProviderStatus,
  renderProviderRequestBody,
} from "@/lib/provider-template"

function resolveProviderProductFields(input: {
  templateKey: string
  network: string
  productId: string
  externalProductCode: string | null
}) {
  const fallbackCode = input.externalProductCode || input.productId

  if (input.templateKey !== "skplug") {
    return {
      externalProductCode: fallbackCode,
      providerNetwork: input.network,
      providerGbSize: fallbackCode,
    }
  }

  const [networkOverride, sizeOverride] = fallbackCode.includes(":")
    ? fallbackCode.split(":", 2).map((part) => part.trim())
    : ["", fallbackCode.trim()]

  return {
    externalProductCode: fallbackCode,
    providerNetwork: networkOverride || input.network,
    providerGbSize: sizeOverride || fallbackCode,
  }
}

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
  const template = await getProviderTemplate(providerConfig.templateKey)
  const externalProductCode = await getProviderProductMapping({
    organizationId: input.organizationId,
    providerKey: providerConfig.providerKey,
    productId: input.productId,
  })

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
    const providerFields = resolveProviderProductFields({
      templateKey: template.templateKey,
      network: input.network,
      productId: input.productId,
      externalProductCode,
    })

    const body = renderProviderRequestBody(template, {
      orderId: input.orderId,
      productId: input.productId,
      externalProductCode: providerFields.externalProductCode,
      providerNetwork: providerFields.providerNetwork,
      providerGbSize: providerFields.providerGbSize,
      network: input.network,
      phone: input.phone,
      quantity: input.quantity,
      amount: input.amount,
    })

    const response = await fetch(providerOrderUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildProviderAuthHeaders(template, providerApiKey),
      },
      body: JSON.stringify(body),
    })

    const payload = await response.json().catch(() => null)
    const accepted = response.ok
    const retryable = !accepted && (response.status === 429 || response.status >= 500)

    const externalRef = readProviderReference(payload, template)
    const immediateStatus = accepted ? readProviderStatus(payload, template) : "FAILED"

    await db.auditLog.create({
      data: {
        action: "ORDER_DISPATCH_ATTEMPT",
        targetType: "ORDER",
        targetId: input.orderId,
        organizationId: input.organizationId,
        meta: JSON.stringify({
          provider: providerName,
          providerKey: providerConfig.providerKey,
          templateKey: template.templateKey,
          mappedProduct: externalProductCode || null,
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
        readProviderMessage(payload, template) ||
        (accepted
            ? "Submitted to provider"
            : retryable
              ? "Provider temporarily failed"
              : "Provider rejected order"),
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
          templateKey: template.templateKey,
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
