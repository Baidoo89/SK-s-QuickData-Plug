import crypto from "crypto"
import { db } from "@/lib/db"
import { getBaseUrl } from "@/lib/mail"
import { getOrganizationPaymentSettings } from "@/lib/organization-payment-settings"
import { getResellerPricingProfileContext, resolveResellerBuyPrice } from "@/lib/reseller-pricing"
import { isSubscriptionActive } from "@/lib/subscription-access"
import {
  getAgentStorefrontPrices,
  getResellerStorefrontPrices,
  getSubscriberStorefrontPrices,
  mapStorefrontPrices,
} from "@/lib/storefront-pricing"

const NETWORK_PREFIXES: Record<string, string[]> = {
  MTN: ["024", "025", "053", "054", "055", "059"],
  AIRTELTIGO: ["026", "027", "056", "057"],
  TELECEL: ["020", "050"],
}

export type StorefrontServiceCheckoutInput = {
  subscriberSlug: string
  agentId?: string
  resellerId?: string
  returnPath?: string
  productId: string
  customerName: string
  phoneNumber: string
  formValues?: Record<string, unknown>
  location?: string
  dateOfBirth?: string
  ghanaCardNumber?: string
}

type ServiceFormField = {
  id: string
  label: string
  type: "TEXT" | "PHONE" | "DATE" | "NUMBER" | "SELECT" | "TEXTAREA" | "GHANA_CARD"
  required: boolean
  placeholder?: string
  options?: string[]
}

const DEFAULT_SERVICE_FIELDS: ServiceFormField[] = [
  { id: "ghanaCardNumber", label: "Ghana Card number", type: "GHANA_CARD", required: true },
  { id: "location", label: "Location / town", type: "TEXT", required: true },
  { id: "dateOfBirth", label: "Date of birth", type: "DATE", required: true },
]

class StorefrontServiceCheckoutError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "StorefrontServiceCheckoutError"
    this.status = status
  }
}

export function isStorefrontServiceCheckoutError(error: unknown): error is StorefrontServiceCheckoutError {
  return error instanceof StorefrontServiceCheckoutError
}

function normalizePhoneNumber(input: string) {
  const digitsOnly = input.replace(/\D/g, "")
  if (digitsOnly.length === 12 && digitsOnly.startsWith("233")) return `0${digitsOnly.slice(3)}`
  if (digitsOnly.length === 10) return digitsOnly
  return null
}

function normalizeProviderName(value: string) {
  return (value || "UNKNOWN").toUpperCase()
}

function phoneMatchesProvider(phoneNumber: string, provider: string) {
  const prefixes = NETWORK_PREFIXES[normalizeProviderName(provider)] || []
  if (prefixes.length === 0) return true
  return prefixes.includes(phoneNumber.slice(0, 3))
}

function normalizeRequiredText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""
}

function normalizeDateOfBirth(value: unknown) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null

  const parsed = new Date(`${trimmed}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed > new Date()) return null
  return parsed
}

function normalizeGhanaCardNumber(value: unknown) {
  if (typeof value !== "string") return ""
  return value.trim().toUpperCase().replace(/\s+/g, "")
}

function parseServiceFields(serviceForm?: string | null): ServiceFormField[] {
  if (!serviceForm) return DEFAULT_SERVICE_FIELDS
  try {
    const parsed = JSON.parse(serviceForm)
    const fields = Array.isArray(parsed?.fields) ? parsed.fields : []
    return fields
      .filter((field: any) => field && typeof field.id === "string" && typeof field.label === "string")
      .map((field: any) => ({
        id: field.id,
        label: field.label,
        type: ["TEXT", "PHONE", "DATE", "NUMBER", "SELECT", "TEXTAREA", "GHANA_CARD"].includes(field.type) ? field.type : "TEXT",
        required: field.required !== false,
        placeholder: typeof field.placeholder === "string" ? field.placeholder : "",
        options: Array.isArray(field.options) ? field.options.filter((option: unknown) => typeof option === "string") : [],
      }))
  } catch {
    return DEFAULT_SERVICE_FIELDS
  }
}

function normalizeFormValues(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, raw]) => {
    if (typeof raw === "string") acc[key] = raw.trim()
    else if (typeof raw === "number") acc[key] = String(raw)
    return acc
  }, {})
}

function storefrontReturnPath(subscriberSlug: string, agentId?: string) {
  const encodedSlug = encodeURIComponent(subscriberSlug)
  if (agentId) return `/store/${encodedSlug}/agent/${encodeURIComponent(agentId)}`
  return `/store/${encodedSlug}`
}

function resellerStorefrontReturnPath(subscriberSlug: string, resellerId?: string, agentId?: string) {
  const encodedSlug = encodeURIComponent(subscriberSlug)
  if (resellerId) return `/store/${encodedSlug}/reseller/${encodeURIComponent(resellerId)}`
  return storefrontReturnPath(subscriberSlug, agentId)
}

function safeStorefrontReturnPath(value: string | undefined) {
  if (!value) return null
  if (!value.startsWith("/shop/") && !value.startsWith("/store/")) return null
  if (value.startsWith("//")) return null
  if (value.includes("\\") || value.includes("\n") || value.includes("\r")) return null
  return value
}

export async function createStorefrontServiceCheckout(input: StorefrontServiceCheckoutInput) {
  const baseUrl = getBaseUrl()
  if (!baseUrl) {
    throw new StorefrontServiceCheckoutError("App URL is not configured", 500)
  }

  const customerName = normalizeRequiredText(input.customerName)
  const phoneNumber = normalizePhoneNumber(input.phoneNumber)
  const rawFormValues = normalizeFormValues(input.formValues)

  if (!input.subscriberSlug) throw new StorefrontServiceCheckoutError("Subscriber slug required")
  if (!input.productId) throw new StorefrontServiceCheckoutError("Service required")
  if (!customerName) throw new StorefrontServiceCheckoutError("Full name is required")
  if (!phoneNumber) throw new StorefrontServiceCheckoutError("Phone number must be exactly 10 digits")

  const subscriber = await db.organization.findUnique({
    where: { slug: input.subscriberSlug },
    include: { subscription: true },
  })

  if (!subscriber) throw new StorefrontServiceCheckoutError("Subscriber not found", 404)
  if (!subscriber.active) throw new StorefrontServiceCheckoutError("This storefront is currently inactive", 403)
  if (!isSubscriptionActive(subscriber.subscription)) {
    throw new StorefrontServiceCheckoutError("This storefront requires an active subscription", 402)
  }

  const paymentSettings = await getOrganizationPaymentSettings(subscriber.id)
  if (!paymentSettings.paystackConnected || !paymentSettings.paystackSecretKey) {
    throw new StorefrontServiceCheckoutError("This storefront is not ready for payments. Ask the business owner to connect Paystack.", 400)
  }

  let resolvedAgentId: string | null = null
  let resolvedResellerId: string | null = null

  if (input.agentId) {
    const agent = await db.agent.findFirst({
      where: { id: input.agentId, organizationId: subscriber.id, active: true },
      select: { id: true },
    })
    if (!agent) throw new StorefrontServiceCheckoutError("Agent not found", 404)
    resolvedAgentId = agent.id
  }

  if (input.resellerId) {
    const reseller = await db.user.findFirst({
      where: {
        id: input.resellerId,
        organizationId: subscriber.id,
        role: "RESELLER",
        active: true,
        signupStatus: "APPROVED",
      },
      select: { id: true, parentAgentId: true },
    })

    if (!reseller?.parentAgentId) throw new StorefrontServiceCheckoutError("Reseller not found", 404)

    const parentAgent = await db.agent.findFirst({
      where: { id: reseller.parentAgentId, organizationId: subscriber.id, active: true },
      select: { id: true },
    })

    if (!parentAgent) throw new StorefrontServiceCheckoutError("Parent agent not available", 404)
    resolvedResellerId = reseller.id
    resolvedAgentId = parentAgent.id
  }

  const product = await db.product.findFirst({
    where: {
      id: input.productId,
      organizationId: subscriber.id,
      active: true,
      category: { in: ["REGISTRATION_SERVICE", "AFA_REGISTRATION"] },
    },
  })

  if (!product) throw new StorefrontServiceCheckoutError("Registration service not found", 404)
  if (!phoneMatchesProvider(phoneNumber, product.provider)) {
    throw new StorefrontServiceCheckoutError("Phone prefix does not match the selected service network")
  }

  const serviceFields = parseServiceFields(product.serviceForm)
  for (const field of serviceFields) {
    const value = rawFormValues[field.id]
    if (field.required && !value) {
      throw new StorefrontServiceCheckoutError(`${field.label} is required`)
    }
    if (field.type === "SELECT" && value && field.options?.length && !field.options.includes(value)) {
      throw new StorefrontServiceCheckoutError(`${field.label} has an invalid option`)
    }
  }

  const location = normalizeRequiredText(rawFormValues.location ?? input.location)
  const dateOfBirth = normalizeDateOfBirth(rawFormValues.dateOfBirth ?? input.dateOfBirth)
  const ghanaCardNumber = normalizeGhanaCardNumber(rawFormValues.ghanaCardNumber ?? input.ghanaCardNumber)

  const subscriberStorefrontPriceMap = mapStorefrontPrices(await getSubscriberStorefrontPrices(subscriber.id))
  const agentStorefrontPriceMap = resolvedAgentId
    ? mapStorefrontPrices(await getAgentStorefrontPrices(resolvedAgentId, subscriber.id))
    : new Map<string, number>()
  const resellerStorefrontPriceMap = resolvedResellerId
    ? mapStorefrontPrices(await getResellerStorefrontPrices(resolvedResellerId, subscriber.id))
    : new Map<string, number>()
  const resellerPricingProfile = resolvedResellerId
    ? await getResellerPricingProfileContext(subscriber.id, resolvedResellerId)
    : null

  const basePriceRecord = await db.basePrice.findUnique({
    where: {
      productId_organizationId: {
        productId: product.id,
        organizationId: subscriber.id,
      },
    },
  })

  const basePrice = basePriceRecord?.price ?? product.price
  let unitPrice = subscriberStorefrontPriceMap.get(product.id) ?? product.price
  let costBasis = basePrice

  if (resolvedAgentId) {
    const agentPrice = await db.agentPrice.findUnique({
      where: { agentId_productId: { agentId: resolvedAgentId, productId: product.id } },
    })
    costBasis = agentPrice?.price ?? basePrice
    unitPrice = agentStorefrontPriceMap.get(product.id) ?? costBasis
  }

  if (resolvedResellerId) {
    const resellerPrice = await db.resellerPrice.findFirst({
      where: { resellerId: resolvedResellerId, productId: product.id, organizationId: subscriber.id },
      select: { price: true },
    })

    const resellerBuyPrice = resolveResellerBuyPrice({
      overridePrice: resellerPrice?.price,
      profilePrice: resellerPricingProfile?.profilePriceMap.get(product.id),
      parentCost: costBasis,
      strictPricing: resellerPricingProfile?.strictPricing,
    })

    if (resellerBuyPrice === null) {
      throw new StorefrontServiceCheckoutError("Selected service is not available from this reseller", 404)
    }

    costBasis = resellerBuyPrice
    unitPrice = resellerStorefrontPriceMap.get(product.id) ?? costBasis
  }

  if (unitPrice <= 0) throw new StorefrontServiceCheckoutError("Checkout amount must be greater than zero")

  const profit = Math.max(unitPrice - costBasis, 0)
  const request = await db.$transaction(async (tx) => {
    let customer = await tx.customer.findFirst({
      where: { phone: phoneNumber, organizationId: subscriber.id },
    })

    if (!customer) {
      customer = await tx.customer.create({
        data: {
          name: customerName,
          email: `${phoneNumber}@placeholder.com`,
          phone: phoneNumber,
          organizationId: subscriber.id,
          agentId: resolvedAgentId ?? undefined,
        },
      })
    } else if (customer.name === "Guest Customer") {
      customer = await tx.customer.update({
        where: { id: customer.id },
        data: { name: customerName },
      })
    }

    const created = await tx.serviceRequest.create({
      data: {
        organizationId: subscriber.id,
        productId: product.id,
        customerId: customer.id,
        agentId: resolvedAgentId ?? undefined,
        userId: resolvedResellerId ?? undefined,
        type: product.category === "AFA_REGISTRATION" ? "AFA_REGISTRATION" : "REGISTRATION_SERVICE",
        status: "PENDING_PAYMENT",
        paymentStatus: "PENDING",
        source: "STOREFRONT",
        sellerRole: resolvedResellerId ? "RESELLER" : resolvedAgentId ? "AGENT" : "SUBSCRIBER",
        sellerUserId: resolvedResellerId ?? undefined,
        sellerAgentId: resolvedAgentId ?? undefined,
        paymentOwner: "STOREFRONT",
        customerName,
        phoneNumber,
        location,
        dateOfBirth,
        total: unitPrice,
        profit,
        details: JSON.stringify({
          serviceName: product.name,
          serviceProvider: product.provider,
          sourceCost: costBasis,
          ghanaCardNumber,
          formFields: serviceFields,
          formValues: rawFormValues,
        }),
      },
    })

    await tx.auditLog.create({
      data: {
        action: "SERVICE_REQUEST_CHECKOUT_CREATED",
        targetType: "SERVICE_REQUEST",
        targetId: created.id,
        organizationId: subscriber.id,
        meta: JSON.stringify({
          type: product.category === "AFA_REGISTRATION" ? "AFA_REGISTRATION" : "REGISTRATION_SERVICE",
          subscriberSlug: subscriber.slug,
          agentId: resolvedAgentId,
          resellerId: resolvedResellerId,
          paymentStatus: "PENDING",
        }),
      },
    })

    return created
  }, { maxWait: 10000, timeout: 20000 })

  const returnPath = safeStorefrontReturnPath(input.returnPath)
    ?? resellerStorefrontReturnPath(subscriber.slug, resolvedResellerId ?? undefined, resolvedAgentId ?? undefined)
  const callbackUrl = `${baseUrl}/api/store/paystack/verify?organizationId=${encodeURIComponent(subscriber.id)}`

  const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${paymentSettings.paystackSecretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: `${phoneNumber}@placeholder.com`,
      amount: Math.round(unitPrice * 100),
      metadata: {
        purpose: "storefront_service_request",
        paymentOwner: "subscriber",
        organizationId: subscriber.id,
        subscriberSlug: subscriber.slug,
        agentId: resolvedAgentId,
        resellerId: resolvedResellerId,
        serviceRequestIds: [request.id],
        serviceRequestCount: 1,
        amountGHS: unitPrice,
        returnPath,
      },
      callback_url: callbackUrl,
    }),
  })

  if (!paystackResponse.ok) {
    await db.serviceRequest.update({
      where: { id: request.id },
      data: { status: "PAYMENT_INIT_FAILED", paymentStatus: "FAILED" },
    })
    throw new StorefrontServiceCheckoutError("Could not initialize payment", 502)
  }

  const paystackData = await paystackResponse.json().catch(() => null)
  if (!paystackData?.status || !paystackData.data?.authorization_url || !paystackData.data?.reference) {
    await db.serviceRequest.update({
      where: { id: request.id },
      data: { status: "PAYMENT_INIT_FAILED", paymentStatus: "FAILED" },
    })
    throw new StorefrontServiceCheckoutError("Could not initialize payment", 502)
  }

  const paymentMetadata = {
    subscriberSlug: subscriber.slug,
    agentId: resolvedAgentId,
    resellerId: resolvedResellerId,
    orderIds: [],
    serviceRequestIds: [request.id],
    serviceRequestCount: 1,
    amountGHS: unitPrice,
    returnPath,
  }

  await db.$executeRaw`
    INSERT INTO "StorefrontPayment" (
      "id",
      "organizationId",
      "reference",
      "amount",
      "status",
      "orderIds",
      "metadata",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${crypto.randomUUID()},
      ${subscriber.id},
      ${paystackData.data.reference},
      ${unitPrice},
      'PENDING',
      ${JSON.stringify([])},
      ${JSON.stringify(paymentMetadata)},
      NOW(),
      NOW()
    )
  `

  await db.serviceRequest.update({
    where: { id: request.id },
    data: { paymentReference: paystackData.data.reference },
  })

  return {
    authorizationUrl: paystackData.data.authorization_url as string,
    accessCode: paystackData.data.access_code as string,
    reference: paystackData.data.reference as string,
    serviceRequestIds: [request.id],
    amount: unitPrice,
    serviceRequestCount: 1,
  }
}
