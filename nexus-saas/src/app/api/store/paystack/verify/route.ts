import { NextResponse } from "next/server"
import { ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { getBaseUrl } from "@/lib/mail"
import { getOrganizationPaymentSettings } from "@/lib/organization-payment-settings"
import { resolveOrderDispatch } from "@/lib/order-dispatch"
import { isAllowedStorefrontReturnUrl } from "@/lib/storefront-url"

export const dynamic = "force-dynamic"

type StorefrontPaymentRow = {
  id: string
  organizationId: string
  reference: string
  amount: number
  status: string
  orderIds: string
  metadata: string | null
}

function parseJsonArray(value: string | null | undefined) {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}

function parseJsonObject(value: string | null | undefined) {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function appendCheckoutQuery(destination: string, params: Record<string, string | number>) {
  const url = new URL(destination)
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value))
  })
  return url.toString()
}

async function resolveReturnDestination(meta: Record<string, unknown>, payment: StorefrontPaymentRow | null, baseUrl: string) {
  const rawReturnUrl = typeof meta.returnUrl === "string" ? meta.returnUrl : ""
  if (isAllowedStorefrontReturnUrl(rawReturnUrl)) {
    return rawReturnUrl
  }

  const parsedPaymentMetaForUrl = parseJsonObject(payment?.metadata)
  const paymentReturnUrl = typeof parsedPaymentMetaForUrl.returnUrl === "string" ? parsedPaymentMetaForUrl.returnUrl : ""
  if (isAllowedStorefrontReturnUrl(paymentReturnUrl)) {
    return paymentReturnUrl
  }

  const rawReturnPath = typeof meta.returnPath === "string" ? meta.returnPath : ""
  if (
    rawReturnPath.startsWith("/shop/") &&
    !rawReturnPath.startsWith("//") &&
    !rawReturnPath.includes("\\") &&
    !rawReturnPath.includes("\n") &&
    !rawReturnPath.includes("\r")
  ) {
    return `${baseUrl}${rawReturnPath}`
  }

  const parsedPaymentMeta = parsedPaymentMetaForUrl
  const subscriberSlug =
    typeof meta.subscriberSlug === "string"
      ? meta.subscriberSlug
      : typeof parsedPaymentMeta.subscriberSlug === "string"
        ? parsedPaymentMeta.subscriberSlug
        : ""
  const agentId =
    typeof meta.agentId === "string"
      ? meta.agentId
      : typeof parsedPaymentMeta.agentId === "string"
        ? parsedPaymentMeta.agentId
        : ""
  const resellerId =
    typeof meta.resellerId === "string"
      ? meta.resellerId
      : typeof parsedPaymentMeta.resellerId === "string"
        ? parsedPaymentMeta.resellerId
        : ""

  if (!subscriberSlug) return baseUrl

  const organization = await db.organization.findUnique({
    where: { slug: subscriberSlug },
    select: { id: true },
  })

  if (!organization) return `${baseUrl}/shop/${encodeURIComponent(subscriberSlug)}`

  const storefrontLink = await db.storefrontLink.findFirst({
    where: resellerId
      ? { organizationId: organization.id, ownerType: "RESELLER", resellerId, active: true }
      : agentId
        ? { organizationId: organization.id, ownerType: "AGENT", agentId, active: true }
        : { organizationId: organization.id, ownerType: "SUBSCRIBER", agentId: null, resellerId: null, active: true },
    select: { slug: true },
  })

  return `${baseUrl}/shop/${encodeURIComponent(storefrontLink?.slug || subscriberSlug)}`
}

async function findStorefrontPayment(reference: string) {
  const rows = await db.$queryRaw<StorefrontPaymentRow[]>`
    SELECT
      "id",
      "organizationId",
      "reference",
      "amount",
      "status",
      "orderIds",
      "metadata"
    FROM "StorefrontPayment"
    WHERE "reference" = ${reference}
    LIMIT 1
  `

  return rows[0] ?? null
}

export async function GET(req: Request) {
  const baseUrl = getBaseUrl()

  try {
    if (!baseUrl) {
      return ApiErrors.INTERNAL_ERROR({ reason: "App URL not configured" })
    }

    const { searchParams } = new URL(req.url)
    const reference = searchParams.get("reference")
    const organizationId = searchParams.get("organizationId")

    if (!reference) {
      return ApiErrors.BAD_REQUEST("Missing reference")
    }

    if (!organizationId) {
      return ApiErrors.BAD_REQUEST("Missing organization")
    }

    const paymentSettings = await getOrganizationPaymentSettings(organizationId)
    if (!paymentSettings.paystackConnected || !paymentSettings.paystackSecretKey) {
      return ApiErrors.BAD_REQUEST("Subscriber Paystack is not connected")
    }

    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${paymentSettings.paystackSecretKey}`,
      },
    })

    if (!response.ok) {
      logApiError("PAYSTACK_STOREFRONT_VERIFY_ERROR", await response.text())
      return ApiErrors.BAD_REQUEST("Payment verification failed")
    }

    const data = await response.json().catch(() => null)
    const meta = (data?.data?.metadata || {}) as Record<string, unknown>
    const payment = await findStorefrontPayment(reference)
    const returnDestination = await resolveReturnDestination(meta, payment, baseUrl)

    if (!payment || payment.organizationId !== organizationId) {
      return NextResponse.redirect(appendCheckoutQuery(returnDestination, { checkout: "failed" }))
    }

    if (!data?.status || data.data?.status !== "success") {
      await db.$executeRaw`
        UPDATE "StorefrontPayment"
        SET "status" = 'FAILED', "updatedAt" = NOW()
        WHERE "reference" = ${reference}
      `

      const paymentMeta = parseJsonObject(payment.metadata)
      const serviceRequestIds = Array.isArray(paymentMeta.serviceRequestIds)
        ? paymentMeta.serviceRequestIds.filter((item): item is string => typeof item === "string")
        : []

      await db.$transaction(async (tx) => {
        await tx.order.updateMany({
          where: {
            id: { in: parseJsonArray(payment.orderIds) },
            organizationId,
            status: "PENDING_PAYMENT",
          },
          data: { status: "PAYMENT_FAILED", paymentStatus: "FAILED" },
        })

        if (serviceRequestIds.length > 0) {
          await tx.serviceRequest.updateMany({
            where: {
              id: { in: serviceRequestIds },
              organizationId,
              status: "PENDING_PAYMENT",
            },
            data: { status: "PAYMENT_FAILED", paymentStatus: "FAILED" },
          })
        }
      })

      return NextResponse.redirect(appendCheckoutQuery(returnDestination, { checkout: "failed" }))
    }

    const metadataOrganizationId = typeof meta.organizationId === "string" ? meta.organizationId : undefined
    if (metadataOrganizationId !== organizationId) {
      return NextResponse.redirect(appendCheckoutQuery(returnDestination, { checkout: "failed" }))
    }

    const orderIdsFromMeta = Array.isArray(meta.orderIds)
      ? meta.orderIds.filter((item): item is string => typeof item === "string")
      : []
    const orderIds = orderIdsFromMeta.length > 0 ? orderIdsFromMeta : parseJsonArray(payment.orderIds)
    const paymentMeta = parseJsonObject(payment.metadata)
    const serviceRequestIdsFromMeta = Array.isArray(meta.serviceRequestIds)
      ? meta.serviceRequestIds.filter((item): item is string => typeof item === "string")
      : []
    const serviceRequestIdsFromPayment = Array.isArray(paymentMeta.serviceRequestIds)
      ? paymentMeta.serviceRequestIds.filter((item): item is string => typeof item === "string")
      : []
    const serviceRequestIds = serviceRequestIdsFromMeta.length > 0 ? serviceRequestIdsFromMeta : serviceRequestIdsFromPayment

    if (orderIds.length === 0 && serviceRequestIds.length === 0) {
      return NextResponse.redirect(appendCheckoutQuery(returnDestination, { checkout: "failed" }))
    }

    const amountFromResponse = typeof data.data?.amount === "number" ? data.data.amount / 100 : 0
    if (amountFromResponse < payment.amount) {
      return NextResponse.redirect(appendCheckoutQuery(returnDestination, { checkout: "failed" }))
    }

    await db.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "StorefrontPayment"
        SET "status" = 'SUCCESS', "paidAt" = NOW(), "updatedAt" = NOW()
        WHERE "reference" = ${reference}
      `

      if (orderIds.length > 0) {
        await tx.order.updateMany({
          where: {
            id: { in: orderIds },
            organizationId,
            status: "PENDING_PAYMENT",
          },
          data: { status: "PENDING", paymentStatus: "PAID" },
        })
      }

      if (serviceRequestIds.length > 0) {
        await tx.serviceRequest.updateMany({
          where: {
            id: { in: serviceRequestIds },
            organizationId,
            status: "PENDING_PAYMENT",
          },
          data: { status: "PENDING_REVIEW", paymentStatus: "PAID", paymentReference: reference },
        })
      }

      const auditRows = [
        ...orderIds.map((orderId) => ({
          action: "STOREFRONT_PAYMENT_SUCCESS",
          targetType: "ORDER",
          targetId: orderId,
          organizationId,
          meta: JSON.stringify({
            reference,
            amountGHS: payment.amount,
            paymentOwner: "subscriber",
          }),
        })),
        ...serviceRequestIds.map((requestId) => ({
          action: "SERVICE_REQUEST_PAYMENT_SUCCESS",
          targetType: "SERVICE_REQUEST",
          targetId: requestId,
          organizationId,
          meta: JSON.stringify({
            reference,
            amountGHS: payment.amount,
            paymentOwner: "subscriber",
          }),
        })),
      ]

      if (auditRows.length > 0) {
        await tx.auditLog.createMany({ data: auditRows })
      }
    })

    const paidOrders = await db.order.findMany({
      where: {
        id: { in: orderIds },
        organizationId,
        status: "PENDING",
      },
      include: {
        items: {
          include: { product: true },
          take: 1,
        },
      },
    })

    for (const order of paidOrders) {
      const item = order.items[0]
      if (!item?.product || !order.phoneNumber) continue

      try {
        await resolveOrderDispatch({
          orderId: order.id,
          organizationId,
          productId: item.product.id,
          network: item.product.provider,
          phone: order.phoneNumber,
          quantity: item.quantity,
          amount: order.total,
        })
      } catch (dispatchError) {
        logApiError("[STORE_PAYSTACK_DISPATCH]", dispatchError)
      }
    }

    const successCount = orderIds.length + serviceRequestIds.length
    return NextResponse.redirect(appendCheckoutQuery(returnDestination, { checkout: "success", orders: successCount }))
  } catch (error) {
    logApiError("[STORE_PAYSTACK_VERIFY]", error)
    return NextResponse.redirect(`${baseUrl || ""}/?checkout=failed`)
  }
}
