import { recordFinancialReview } from "@/lib/financial-review"
import { settleStorefrontPayment, claimStorefrontDispatch } from "@/lib/storefront-payment-settlement"
import { NextResponse } from "next/server"
import { ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { getBaseUrl } from "@/lib/mail"
import { getOrganizationPaymentSettings } from "@/lib/organization-payment-settings"
import { resolveOrderDispatch } from "@/lib/order-dispatch"
import { resolveOrderRecipientPhone } from "@/lib/order-recipient"
import { parsePaystackMetadata } from "@/lib/paystack-metadata"

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

async function resolveReturnPath(meta: Record<string, unknown>, payment: StorefrontPaymentRow | null) {
  const rawReturnPath = typeof meta.returnPath === "string" ? meta.returnPath : ""
  if (
    rawReturnPath.startsWith("/shop/") &&
    !rawReturnPath.startsWith("//") &&
    !rawReturnPath.includes("\\") &&
    !rawReturnPath.includes("\n") &&
    !rawReturnPath.includes("\r")
  ) {
    return rawReturnPath
  }

  const parsedPaymentMeta = parsePaystackMetadata(payment?.metadata)
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

  if (!subscriberSlug) return "/"

  const organization = await db.organization.findUnique({
    where: { slug: subscriberSlug },
    select: { id: true },
  })

  if (!organization) return `/shop/${encodeURIComponent(subscriberSlug)}`

  const storefrontLink = await db.storefrontLink.findFirst({
    where: resellerId
      ? { organizationId: organization.id, ownerType: "RESELLER", resellerId, active: true }
      : agentId
        ? { organizationId: organization.id, ownerType: "AGENT", agentId, active: true }
        : { organizationId: organization.id, ownerType: "SUBSCRIBER", agentId: null, resellerId: null, active: true },
    select: { slug: true },
  })

  return `/shop/${encodeURIComponent(storefrontLink?.slug || subscriberSlug)}`
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
  let verifiedSuccess = false
  let reviewReference: string | null = null
  let reviewOrganization: string | null = null
  const baseUrl = getBaseUrl()

  try {
    if (!baseUrl) {
      return ApiErrors.INTERNAL_ERROR({ reason: "App URL not configured" })
    }

    const { searchParams } = new URL(req.url)
    const reference = searchParams.get("reference")
    const organizationId = searchParams.get("organizationId")
    reviewReference = reference
    reviewOrganization = organizationId

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

    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: {
        Authorization: `Bearer ${paymentSettings.paystackSecretKey}`,
      },
    })

    if (!response.ok) {
      logApiError("PAYSTACK_STOREFRONT_VERIFY_ERROR", await response.text())
      return ApiErrors.BAD_REQUEST("Payment verification failed")
    }

    const data = await response.json().catch(() => null)
    verifiedSuccess = data?.status === true && data?.data?.status === "success"
    const meta = parsePaystackMetadata(data?.data?.metadata)
    const payment = await findStorefrontPayment(reference)
    const returnPath = await resolveReturnPath(meta, payment)

    if (!payment || payment.organizationId !== organizationId) {
      return NextResponse.redirect(`${baseUrl}${returnPath}?checkout=failed`)
    }

    if (!data?.status || !data.data) return NextResponse.redirect(`${baseUrl}${returnPath}?checkout=failed`)
    const settlement = await settleStorefrontPayment({ reference, organizationId, gatewayPayment: data.data })
    if (!settlement.success) return NextResponse.redirect(`${baseUrl}${returnPath}?checkout=failed`)
    const orderIds = settlement.orderIdsToDispatch

    const paidOrders = await db.order.findMany({
      where: {
        id: { in: orderIds },
        organizationId,
        status: "PENDING",
      },
      include: {
        customer: true,
        items: {
          include: { product: true },
          take: 1,
        },
      },
    })

    for (const order of paidOrders) {
      const item = order.items[0]
      const recipientPhone = resolveOrderRecipientPhone(order)
      if (!item?.product || !recipientPhone) continue

      try {
        if (!await claimStorefrontDispatch(order.id, organizationId, reference)) continue
        const dispatch = await resolveOrderDispatch({
          orderId: order.id,
          organizationId,
          productId: item.product.id,
          network: item.product.provider,
          phone: recipientPhone,
          quantity: item.quantity,
          amount: order.total,
        })
        await db.auditLog.create({ data: { action: "STOREFRONT_DISPATCH_HANDLED", targetType: "ORDER", targetId: order.id, organizationId, meta: JSON.stringify({ reference, dispatchMode: dispatch.dispatchMode, status: dispatch.finalStatus }) } })
      } catch (dispatchError) {
        await recordFinancialReview({ kind: "DISPATCH_UNCERTAIN", targetType: "ORDER", targetId: order.id, organizationId, reference, reason: "Dispatch was interrupted or failed. Check the provider before retrying." })
        logApiError("[STORE_PAYSTACK_DISPATCH]", dispatchError)
      }
    }

    const successCount = settlement.count
    return NextResponse.redirect(`${baseUrl}${returnPath}?checkout=success&orders=${successCount}`)
  } catch (error) {
    if (verifiedSuccess && reviewReference && error instanceof Error && ["INVALID_STOREFRONT_PAYMENT", "STOREFRONT_PAYMENT_NEEDS_REVIEW", "INVALID_MONEY"].includes(error.message)) {
      try {
        const payment = await db.storefrontPayment.findUnique({ where: { reference: reviewReference } })
        if (payment && payment.organizationId === reviewOrganization) await recordFinancialReview({ kind: "STOREFRONT_PAYMENT", organizationId: payment.organizationId, targetType: "STOREFRONT_PAYMENT", targetId: payment.id, reference: payment.reference, reason: "Verified payment does not match the saved checkout or member state. Reconcile it with the gateway." })
      } catch (recordError) { logApiError("STORE_PAYMENT_REVIEW_RECORD", recordError) }
    }
    logApiError("[STORE_PAYSTACK_VERIFY]", error)
    return NextResponse.redirect(`${baseUrl || ""}/?checkout=failed`)
  }
}
