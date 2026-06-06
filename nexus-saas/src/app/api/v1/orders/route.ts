import { z } from "zod"

import { apiSuccess, ApiErrors, apiError, logApiError } from "@/lib/api-response"
import { authenticateApiKey } from "@/lib/api-key-auth"
import { assertApiOrderRateLimit, findApiOrderByExternalReference, getApiOrderCreationMeta } from "@/lib/api-order-tracking"
import { db } from "@/lib/db"
import { resolveOrderDispatch } from "@/lib/order-dispatch"
import { getResellerPricingProfileContext, resolveResellerBuyPrice } from "@/lib/reseller-pricing"
import { requireActiveSubscription } from "@/lib/subscription-access"

export const dynamic = "force-dynamic"

const NETWORK_PREFIXES: Record<string, string[]> = {
  MTN: ["024", "025", "053", "054", "055", "059"],
  AIRTELTIGO: ["026", "027", "056", "057"],
  TELECEL: ["020", "050"],
}

const createApiOrderSchema = z.object({
  productId: z.string().min(1),
  phoneNumber: z.string().min(1),
  quantity: z.number().int().min(1).max(100).default(1),
  customerName: z.string().optional(),
  customerEmail: z.string().email().optional(),
  externalReference: z.string().optional(),
  callbackUrl: z.string().url().optional(),
  amountPaid: z.number().positive().optional(),
})

function normalizePhoneNumber(input: string) {
  const digitsOnly = input.replace(/\D/g, "")
  if (digitsOnly.length === 12 && digitsOnly.startsWith("233")) return `0${digitsOnly.slice(3)}`
  if (digitsOnly.length === 10) return digitsOnly
  return null
}

function phoneMatchesProvider(phoneNumber: string, provider: string) {
  const prefixes = NETWORK_PREFIXES[provider.toUpperCase()] || []
  if (prefixes.length === 0) return true
  return prefixes.includes(phoneNumber.slice(0, 3))
}

function toApiOrderResponse(order: {
  id: string
  status: string
  phoneNumber: string | null
  total: number
  items: { quantity: number; price: number; product: { id: string; provider: string } }[]
}, externalReference: string | null, message = "API order found") {
  const item = order.items[0]
  return apiSuccess(
    {
      orderId: order.id,
      status: order.status,
      source: "API",
      network: item?.product.provider || null,
      phoneNumber: order.phoneNumber,
      productId: item?.product.id || null,
      quantity: item?.quantity || null,
      unitPrice: item?.price || null,
      total: order.total,
      externalReference,
    },
    message
  )
}

async function resolveApiSellerPricing(input: {
  organizationId: string
  productId: string
  productPrice: number
  quantity: number
  amountPaid?: number
  apiOwnerType: "SUBSCRIBER" | "AGENT" | "RESELLER"
  ownerUserId: string | null
  ownerAgentId: string | null
}) {
  const basePriceRecord = await db.basePrice.findUnique({
    where: {
      productId_organizationId: {
        productId: input.productId,
        organizationId: input.organizationId,
      },
    },
    select: { price: true },
  })
  const basePrice = basePriceRecord?.price ?? input.productPrice

  if (input.apiOwnerType === "SUBSCRIBER") {
    const storefrontPrice = await db.subscriberStorefrontPrice.findUnique({
      where: {
        productId_organizationId: {
          productId: input.productId,
          organizationId: input.organizationId,
        },
      },
      select: { price: true },
    })
    const defaultSellingPrice = storefrontPrice?.price ?? input.productPrice
    const total = input.amountPaid ?? defaultSellingPrice * input.quantity
    const sellingUnitPrice = total / input.quantity

    return {
      sellerRole: "SUBSCRIBER",
      sellerUserId: null as string | null,
      sellerAgentId: null as string | null,
      agentId: null as string | null,
      costUnitPrice: basePrice,
      sellingUnitPrice,
      total,
    }
  }

  if (input.apiOwnerType === "AGENT") {
    if (!input.ownerUserId || !input.ownerAgentId) {
      throw new Error("API_OWNER_NOT_LINKED")
    }

    const owner = await db.user.findFirst({
      where: {
        id: input.ownerUserId,
        organizationId: input.organizationId,
        role: "AGENT",
        agentId: input.ownerAgentId,
        active: true,
        signupStatus: "APPROVED",
      },
      select: { id: true },
    })
    const agent = await db.agent.findFirst({
      where: { id: input.ownerAgentId, organizationId: input.organizationId, active: true },
      select: { id: true },
    })

    if (!owner || !agent) {
      throw new Error("API_OWNER_NOT_LINKED")
    }

    const [agentPrice, storefrontPrice] = await Promise.all([
      db.agentPrice.findUnique({
        where: { agentId_productId: { agentId: input.ownerAgentId, productId: input.productId } },
        select: { price: true },
      }),
      db.agentStorefrontPrice.findUnique({
        where: { agentId_productId: { agentId: input.ownerAgentId, productId: input.productId } },
        select: { price: true },
      }),
    ])
    const costUnitPrice = agentPrice?.price ?? basePrice
    const defaultSellingPrice = storefrontPrice?.price ?? costUnitPrice
    const total = input.amountPaid ?? defaultSellingPrice * input.quantity
    const sellingUnitPrice = total / input.quantity

    return {
      sellerRole: "AGENT",
      sellerUserId: input.ownerUserId,
      sellerAgentId: input.ownerAgentId,
      agentId: input.ownerAgentId,
      costUnitPrice,
      sellingUnitPrice,
      total,
    }
  }

  if (!input.ownerUserId || !input.ownerAgentId) {
    throw new Error("API_OWNER_NOT_LINKED")
  }

  const reseller = await db.user.findFirst({
    where: {
      id: input.ownerUserId,
      organizationId: input.organizationId,
      role: "RESELLER",
      parentAgentId: input.ownerAgentId,
      active: true,
      signupStatus: "APPROVED",
    },
    select: { id: true },
  })
  const parentAgent = await db.agent.findFirst({
    where: { id: input.ownerAgentId, organizationId: input.organizationId, active: true },
    select: { id: true },
  })

  if (!reseller || !parentAgent) {
    throw new Error("API_OWNER_NOT_LINKED")
  }

  const [parentAgentPrice, resellerPrice, storefrontPrice, resellerProfile] = await Promise.all([
    db.agentPrice.findUnique({
      where: { agentId_productId: { agentId: input.ownerAgentId, productId: input.productId } },
      select: { price: true },
    }),
    db.resellerPrice.findFirst({
      where: {
        resellerId: input.ownerUserId,
        productId: input.productId,
        organizationId: input.organizationId,
      },
      select: { price: true },
    }),
    db.resellerStorefrontPrice.findUnique({
      where: { resellerId_productId: { resellerId: input.ownerUserId, productId: input.productId } },
      select: { price: true },
    }),
    getResellerPricingProfileContext(input.organizationId, input.ownerUserId),
  ])

  const parentCost = parentAgentPrice?.price ?? basePrice
  const resellerBuyPrice = resolveResellerBuyPrice({
    overridePrice: resellerPrice?.price,
    profilePrice: resellerProfile.profilePriceMap.get(input.productId),
    parentCost,
    strictPricing: resellerProfile.strictPricing,
  })

  if (resellerBuyPrice === null) {
    throw new Error("API_PRODUCT_NOT_AVAILABLE")
  }

  const defaultSellingPrice = storefrontPrice?.price ?? resellerBuyPrice
  const total = input.amountPaid ?? defaultSellingPrice * input.quantity
  const sellingUnitPrice = total / input.quantity

  return {
    sellerRole: "RESELLER",
    sellerUserId: input.ownerUserId,
    sellerAgentId: input.ownerAgentId,
    agentId: input.ownerAgentId,
    costUnitPrice: resellerBuyPrice,
    sellingUnitPrice,
    total,
  }
}

export async function GET(req: Request) {
  try {
    const apiAuth = await authenticateApiKey(req)
    if (!apiAuth) return ApiErrors.UNAUTHORIZED()

    const url = new URL(req.url)
    const orderId = url.searchParams.get("orderId")?.trim()
    const externalReference = url.searchParams.get("externalReference")?.trim()

    if (!orderId && !externalReference) {
      return ApiErrors.BAD_REQUEST("Provide orderId or externalReference")
    }

    const order = externalReference
      ? await findApiOrderByExternalReference({
          organizationId: apiAuth.organizationId,
          externalReference,
          apiKeyId: apiAuth.apiKeyId,
        })
      : await db.order.findFirst({
          where: {
            id: orderId!,
            organizationId: apiAuth.organizationId,
          },
          include: {
            items: { include: { product: true }, take: 1 },
            customer: true,
          },
        })

    if (!order) {
      return ApiErrors.NOT_FOUND("API order")
    }

    const meta = externalReference ? { externalReference } : await getApiOrderCreationMeta(order.id)
    if (!externalReference && meta.source !== "API") {
      return ApiErrors.NOT_FOUND("API order")
    }
    if (!externalReference && meta.apiKeyId && meta.apiKeyId !== apiAuth.apiKeyId) {
      return ApiErrors.NOT_FOUND("API order")
    }

    return toApiOrderResponse(order, externalReference || meta.externalReference || null)
  } catch (error) {
    logApiError("[API_V1_ORDERS_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function POST(req: Request) {
  try {
    const apiAuth = await authenticateApiKey(req)
    if (!apiAuth) {
      return ApiErrors.UNAUTHORIZED()
    }

    const subscriptionError = await requireActiveSubscription(apiAuth.organizationId)
    if (subscriptionError) return subscriptionError

    const body = await req.json().catch(() => null)
    const parsed = createApiOrderSchema.safeParse(body)
    if (!parsed.success) {
      return ApiErrors.VALIDATION_ERROR(parsed.error.flatten().fieldErrors)
    }

    const normalizedPhone = normalizePhoneNumber(parsed.data.phoneNumber)
    if (!normalizedPhone) {
      return ApiErrors.BAD_REQUEST("Phone number must be exactly 10 digits")
    }

    const externalReference = parsed.data.externalReference?.trim()
    if (externalReference) {
      const existingOrder = await findApiOrderByExternalReference({
        organizationId: apiAuth.organizationId,
        externalReference,
        apiKeyId: apiAuth.apiKeyId,
      })

      if (existingOrder) {
        return toApiOrderResponse(existingOrder, externalReference, "API order already exists")
      }
    }

    const rateLimit = await assertApiOrderRateLimit({
      apiKeyId: apiAuth.apiKeyId,
      organizationId: apiAuth.organizationId,
    })
    if (!rateLimit.ok) {
      return apiError("RATE_LIMITED", `API order limit exceeded. Try again in a minute. Limit: ${rateLimit.limit}/minute.`, 429)
    }

    const organization = await db.organization.findUnique({
      where: { id: apiAuth.organizationId },
      select: { id: true, active: true },
    })

    if (!organization?.active) {
      return ApiErrors.FORBIDDEN()
    }

    const product = await db.product.findFirst({
      where: {
        id: parsed.data.productId,
        organizationId: apiAuth.organizationId,
        active: true,
      },
    })

    if (!product) {
      return ApiErrors.NOT_FOUND("Product")
    }

    if (!phoneMatchesProvider(normalizedPhone, product.provider)) {
      return ApiErrors.BAD_REQUEST("Phone number does not match selected network")
    }

    const pricing = await resolveApiSellerPricing({
      organizationId: apiAuth.organizationId,
      productId: product.id,
      productPrice: product.price,
      quantity: parsed.data.quantity,
      amountPaid: parsed.data.amountPaid,
      apiOwnerType: apiAuth.ownerType,
      ownerUserId: apiAuth.ownerUserId,
      ownerAgentId: apiAuth.ownerAgentId,
    })
    const computedTotal = pricing.costUnitPrice * parsed.data.quantity

    const order = await db.$transaction(async (tx) => {
      const customerEmail = parsed.data.customerEmail || `${normalizedPhone}@api.placeholder.com`
      let customer = await tx.customer.findFirst({
        where: {
          organizationId: apiAuth.organizationId,
          OR: [{ phone: normalizedPhone }, { email: customerEmail }],
        },
      })

      if (!customer) {
        customer = await tx.customer.create({
          data: {
            name: parsed.data.customerName?.trim() || "API Customer",
            email: customerEmail,
            phone: normalizedPhone,
            organizationId: apiAuth.organizationId,
          },
        })
      }

      const created = await tx.order.create({
        data: {
          organizationId: apiAuth.organizationId,
          customerId: customer.id,
          agentId: pricing.agentId ?? undefined,
          userId: pricing.sellerUserId ?? undefined,
          total: pricing.total,
          status: "PENDING",
          phoneNumber: normalizedPhone,
          source: "API",
          sellerRole: pricing.sellerRole,
          sellerUserId: pricing.sellerUserId,
          sellerAgentId: pricing.sellerAgentId,
          customerType: "API_CUSTOMER",
          paymentOwner: "EXTERNAL",
          paymentStatus: "PAID",
          fulfillmentMode: "MANUAL",
          externalReference: externalReference || null,
          items: {
            create: {
              productId: product.id,
              quantity: parsed.data.quantity,
              price: pricing.sellingUnitPrice,
              profit: Math.max(pricing.total - computedTotal, 0),
            },
          },
        },
      })

      await tx.auditLog.create({
        data: {
          action: "API_ORDER_CREATED",
          targetType: "ORDER",
          targetId: created.id,
          organizationId: apiAuth.organizationId,
          actorId: apiAuth.apiKeyId,
          actorName: apiAuth.apiKeyName,
          meta: JSON.stringify({
            source: "API",
            apiKeyId: apiAuth.apiKeyId,
            apiKeyOwnerType: apiAuth.ownerType,
            sellerRole: pricing.sellerRole,
            sellerUserId: pricing.sellerUserId,
            sellerAgentId: pricing.sellerAgentId,
            externalReference: externalReference || null,
            callbackUrl: parsed.data.callbackUrl || null,
            amountPaid: pricing.total,
            computedTotal,
            costUnitPrice: pricing.costUnitPrice,
            sellingUnitPrice: pricing.sellingUnitPrice,
            network: product.provider,
          }),
        },
      })

      return created
    }, { maxWait: 10000, timeout: 20000 })

    const dispatch = await resolveOrderDispatch({
      orderId: order.id,
      organizationId: apiAuth.organizationId,
      productId: product.id,
      network: product.provider,
      phone: normalizedPhone,
      quantity: parsed.data.quantity,
      amount: order.total,
    })

    return apiSuccess(
      {
        orderId: order.id,
        status: dispatch.finalStatus,
        source: "API",
        network: product.provider,
        phoneNumber: normalizedPhone,
        productId: product.id,
        quantity: parsed.data.quantity,
        unitPrice: pricing.sellingUnitPrice,
        total: order.total,
        sellerRole: pricing.sellerRole,
        externalReference: externalReference || null,
        dispatchMode: dispatch.dispatchMode,
        dispatchProvider: dispatch.dispatchProvider,
        dispatchReason: dispatch.dispatchReason,
      },
      "API order created",
      201
    )
  } catch (error) {
    if (error instanceof Error && error.message === "API_OWNER_NOT_LINKED") {
      return ApiErrors.BAD_REQUEST("API key owner is not linked to an active approved seller account.")
    }
    if (error instanceof Error && error.message === "API_PRODUCT_NOT_AVAILABLE") {
      return ApiErrors.BAD_REQUEST("Selected product is not available for this API key owner.")
    }
    logApiError("[API_V1_ORDERS_POST]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
