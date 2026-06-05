import { z } from "zod"

import { apiSuccess, ApiErrors, apiError, logApiError } from "@/lib/api-response"
import { authenticateApiKey } from "@/lib/api-key-auth"
import { assertApiOrderRateLimit, findApiOrderByExternalReference, getApiOrderCreationMeta } from "@/lib/api-order-tracking"
import { db } from "@/lib/db"
import { resolveOrderDispatch } from "@/lib/order-dispatch"
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

    const basePriceRecord = await db.basePrice.findUnique({
      where: {
        productId_organizationId: {
          productId: product.id,
          organizationId: apiAuth.organizationId,
        },
      },
    })

    const unitPrice = basePriceRecord?.price ?? product.price
    const computedTotal = unitPrice * parsed.data.quantity
    const total = parsed.data.amountPaid ?? computedTotal

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
          total,
          status: "PENDING",
          phoneNumber: normalizedPhone,
          source: "API",
          sellerRole: "SUBSCRIBER",
          sellerUserId: null,
          sellerAgentId: null,
          customerType: "API_CUSTOMER",
          paymentOwner: "EXTERNAL",
          paymentStatus: "PAID",
          fulfillmentMode: "MANUAL",
          externalReference: externalReference || null,
          items: {
            create: {
              productId: product.id,
              quantity: parsed.data.quantity,
              price: unitPrice,
              profit: Math.max(total - computedTotal, 0),
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
            externalReference: externalReference || null,
            callbackUrl: parsed.data.callbackUrl || null,
            amountPaid: total,
            computedTotal,
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
        unitPrice,
        total: order.total,
        externalReference: externalReference || null,
        dispatchMode: dispatch.dispatchMode,
        dispatchProvider: dispatch.dispatchProvider,
        dispatchReason: dispatch.dispatchReason,
      },
      "API order created",
      201
    )
  } catch (error) {
    logApiError("[API_V1_ORDERS_POST]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
