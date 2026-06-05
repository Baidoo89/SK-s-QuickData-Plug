import crypto from "crypto"
import { db } from "@/lib/db"
import { getBaseUrl } from "@/lib/mail"
import { getOrganizationPaymentSettings } from "@/lib/organization-payment-settings"
import { getResellerPricingProfileContext, resolveResellerBuyPrice } from "@/lib/reseller-pricing"
import { isSubscriptionActive } from "@/lib/subscription-access"
import { getAgentStorefrontPrices, getResellerStorefrontPrices, getSubscriberStorefrontPrices, mapStorefrontPrices } from "@/lib/storefront-pricing"

export type StorefrontCheckoutItem = {
  productId: string
  phoneNumber: string
  quantity?: number
}

export type StorefrontCheckoutInput = {
  subscriberSlug: string
  agentId?: string
  resellerId?: string
  returnPath?: string
  items: StorefrontCheckoutItem[]
}

type ResolvedCheckoutItem = {
  productId: string
  provider: string
  phoneNumber: string
  quantity: number
  unitPrice: number
  basePrice: number
  profit: number
}

const NETWORK_PREFIXES: Record<string, string[]> = {
  MTN: ["024", "025", "053", "054", "055", "059"],
  AIRTELTIGO: ["026", "027", "056", "057"],
  TELECEL: ["020", "050"],
}

class StorefrontCheckoutError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "StorefrontCheckoutError"
    this.status = status
  }
}

export function isStorefrontCheckoutError(error: unknown): error is StorefrontCheckoutError {
  return error instanceof StorefrontCheckoutError
}

function normalizePhoneNumber(input: string) {
  const digitsOnly = input.replace(/\D/g, "")
  if (digitsOnly.length === 12 && digitsOnly.startsWith("233")) return `0${digitsOnly.slice(3)}`
  if (digitsOnly.length === 10) return digitsOnly
  return null
}

function safeQuantity(value: unknown) {
  const quantity = Number(value ?? 1)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    throw new StorefrontCheckoutError("Quantity must be between 1 and 100")
  }
  return quantity
}

function phoneMatchesProvider(phoneNumber: string, provider: string) {
  const prefixes = NETWORK_PREFIXES[provider.toUpperCase()] || []
  if (prefixes.length === 0) return true
  return prefixes.includes(phoneNumber.slice(0, 3))
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

export async function createStorefrontCheckout(input: StorefrontCheckoutInput) {
  const baseUrl = getBaseUrl()
  if (!baseUrl) {
    throw new StorefrontCheckoutError("App URL is not configured", 500)
  }

  if (!input.subscriberSlug) {
    throw new StorefrontCheckoutError("Subscriber slug required")
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new StorefrontCheckoutError("At least one order item is required")
  }

  if (input.items.length > 50) {
    throw new StorefrontCheckoutError("Bulk checkout is limited to 50 orders at a time")
  }

  const subscriber = await db.organization.findUnique({
    where: { slug: input.subscriberSlug },
    include: { subscription: true },
  })

  if (!subscriber) {
    throw new StorefrontCheckoutError("Subscriber not found", 404)
  }

  if (!subscriber.active) {
    throw new StorefrontCheckoutError("This storefront is currently inactive", 403)
  }

  if (!isSubscriptionActive(subscriber.subscription)) {
    throw new StorefrontCheckoutError("This storefront requires an active subscription", 402)
  }

  const paymentSettings = await getOrganizationPaymentSettings(subscriber.id)
  if (!paymentSettings.paystackConnected || !paymentSettings.paystackSecretKey) {
    throw new StorefrontCheckoutError("This storefront is not ready for payments. Ask the business owner to connect Paystack.", 400)
  }

  let resolvedAgentId: string | null = null
  let resolvedResellerId: string | null = null
  if (input.agentId) {
    const agent = await db.agent.findFirst({
      where: { id: input.agentId, organizationId: subscriber.id, active: true },
    })

    if (!agent) {
      throw new StorefrontCheckoutError("Agent not found", 404)
    }

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

    if (!reseller?.parentAgentId) {
      throw new StorefrontCheckoutError("Reseller not found", 404)
    }

    const parentAgent = await db.agent.findFirst({
      where: { id: reseller.parentAgentId, organizationId: subscriber.id, active: true },
      select: { id: true },
    })

    if (!parentAgent) {
      throw new StorefrontCheckoutError("Parent agent not available", 404)
    }

    resolvedResellerId = reseller.id
    resolvedAgentId = parentAgent.id
  }

  const resolvedItems: ResolvedCheckoutItem[] = []
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

  for (const rawItem of input.items) {
    if (!rawItem.productId) {
      throw new StorefrontCheckoutError("Product ID required")
    }

    const phoneNumber = normalizePhoneNumber(rawItem.phoneNumber || "")
    if (!phoneNumber) {
      throw new StorefrontCheckoutError("Phone number must be exactly 10 digits")
    }

    const quantity = safeQuantity(rawItem.quantity)
    const product = await db.product.findFirst({
      where: { id: rawItem.productId, organizationId: subscriber.id, active: true },
    })

    if (!product) {
      throw new StorefrontCheckoutError("Product not found", 404)
    }

    if (!phoneMatchesProvider(phoneNumber, product.provider)) {
      throw new StorefrontCheckoutError("Phone number does not match selected network")
    }

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

      if (agentPrice) {
        costBasis = agentPrice.price
      }

      unitPrice = agentStorefrontPriceMap.get(product.id) ?? costBasis
    }

    if (resolvedResellerId) {
      const parentAgentPrice = resolvedAgentId
        ? await db.agentPrice.findUnique({
            where: { agentId_productId: { agentId: resolvedAgentId, productId: product.id } },
          })
        : null
      const resellerPrice = await db.resellerPrice.findFirst({
        where: {
          resellerId: resolvedResellerId,
          productId: product.id,
          organizationId: subscriber.id,
        },
      })

      costBasis = parentAgentPrice?.price ?? basePrice
      const resellerBuyPrice = resolveResellerBuyPrice({
        overridePrice: resellerPrice?.price,
        profilePrice: resellerPricingProfile?.profilePriceMap.get(product.id),
        parentCost: costBasis,
        strictPricing: resellerPricingProfile?.strictPricing,
      })

      if (resellerBuyPrice === null) {
        throw new StorefrontCheckoutError("Selected product is not available from this reseller", 404)
      }

      costBasis = resellerBuyPrice
      unitPrice = resellerStorefrontPriceMap.get(product.id) ?? resellerBuyPrice
    }

    resolvedItems.push({
      productId: product.id,
      provider: product.provider,
      phoneNumber,
      quantity,
      unitPrice,
      basePrice: costBasis,
      profit: Math.max((unitPrice - costBasis) * quantity, 0),
    })
  }

  const total = resolvedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  if (total <= 0) {
    throw new StorefrontCheckoutError("Checkout total must be greater than zero")
  }

  const orders = await db.$transaction(async (tx) => {
    const createdOrders = []

    for (const item of resolvedItems) {
      let customer = await tx.customer.findFirst({
        where: {
          phone: item.phoneNumber,
          organizationId: subscriber.id,
        },
      })

      if (!customer) {
        customer = await tx.customer.create({
          data: {
            name: "Guest Customer",
            email: `${item.phoneNumber}@placeholder.com`,
            phone: item.phoneNumber,
            organizationId: subscriber.id,
            agentId: resolvedAgentId ?? undefined,
          },
        })
      }

      const order = await tx.order.create({
        data: {
          organizationId: subscriber.id,
          customerId: customer.id,
          userId: resolvedResellerId ?? undefined,
          agentId: resolvedAgentId ?? undefined,
          total: item.unitPrice * item.quantity,
          status: "PENDING_PAYMENT",
          phoneNumber: item.phoneNumber,
          source: "STOREFRONT",
          sellerRole: resolvedResellerId ? "RESELLER" : resolvedAgentId ? "AGENT" : "SUBSCRIBER",
          sellerUserId: resolvedResellerId ?? undefined,
          sellerAgentId: resolvedAgentId ?? undefined,
          customerType: "PUBLIC_CUSTOMER",
          paymentOwner: "STOREFRONT",
          paymentStatus: "PENDING",
          fulfillmentMode: "MANUAL",
          items: {
            create: {
              productId: item.productId,
              quantity: item.quantity,
              price: item.unitPrice,
              profit: item.profit,
            },
          },
        },
      })

      await tx.auditLog.create({
        data: {
          action: "STOREFRONT_CHECKOUT_CREATED",
          targetType: "ORDER",
          targetId: order.id,
          organizationId: subscriber.id,
          meta: JSON.stringify({
            subscriberSlug: subscriber.slug,
            agentId: resolvedAgentId,
            resellerId: resolvedResellerId,
            paymentStatus: "PENDING",
          }),
        },
      })

      createdOrders.push(order)
    }

    return createdOrders
  }, { maxWait: 10000, timeout: 20000 })

  const orderIds = orders.map((order) => order.id)
  const amountInPesewas = Math.round(total * 100)
  const firstPhone = resolvedItems[0]?.phoneNumber || "customer"
  const returnPath = safeStorefrontReturnPath(input.returnPath) ?? resellerStorefrontReturnPath(subscriber.slug, resolvedResellerId ?? undefined, resolvedAgentId ?? undefined)
  const callbackUrl = `${baseUrl}/api/store/paystack/verify?organizationId=${encodeURIComponent(subscriber.id)}`

  const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${paymentSettings.paystackSecretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: `${firstPhone}@placeholder.com`,
      amount: amountInPesewas,
      metadata: {
        purpose: "storefront_order",
        paymentOwner: "subscriber",
        organizationId: subscriber.id,
        subscriberSlug: subscriber.slug,
        agentId: resolvedAgentId,
        resellerId: resolvedResellerId,
        orderIds,
        orderCount: orderIds.length,
        amountGHS: total,
        returnPath,
      },
      callback_url: callbackUrl,
    }),
  })

  if (!paystackResponse.ok) {
    await db.order.updateMany({
      where: { id: { in: orderIds }, organizationId: subscriber.id, status: "PENDING_PAYMENT" },
      data: { status: "PAYMENT_INIT_FAILED" },
    })
    throw new StorefrontCheckoutError("Could not initialize payment", 502)
  }

  const paystackData = await paystackResponse.json().catch(() => null)
  if (!paystackData?.status || !paystackData.data?.authorization_url || !paystackData.data?.reference) {
    await db.order.updateMany({
      where: { id: { in: orderIds }, organizationId: subscriber.id, status: "PENDING_PAYMENT" },
      data: { status: "PAYMENT_INIT_FAILED" },
    })
    throw new StorefrontCheckoutError("Could not initialize payment", 502)
  }

  const metadata = {
    subscriberSlug: subscriber.slug,
    agentId: resolvedAgentId,
    resellerId: resolvedResellerId,
    orderIds,
    orderCount: orderIds.length,
    amountGHS: total,
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
      ${total},
      'PENDING',
      ${JSON.stringify(orderIds)},
      ${JSON.stringify(metadata)},
      NOW(),
      NOW()
    )
  `

  return {
    authorizationUrl: paystackData.data.authorization_url as string,
    accessCode: paystackData.data.access_code as string,
    reference: paystackData.data.reference as string,
    orderIds,
    amount: total,
    orderCount: orderIds.length,
  }
}
