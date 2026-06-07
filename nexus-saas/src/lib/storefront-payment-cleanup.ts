import { db } from "@/lib/db"

type PendingStorefrontPayment = {
  id: string
  organizationId: string
  reference: string
  orderIds: string
  metadata: string | null
  createdAt: Date
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

function getPendingPaymentTimeoutMinutes() {
  const value = Number(process.env.STOREFRONT_PAYMENT_PENDING_TIMEOUT_MINUTES || "30")
  return Number.isFinite(value) && value >= 5 ? value : 30
}

export async function expireAbandonedStorefrontPayments(organizationId?: string | null) {
  const timeoutMinutes = getPendingPaymentTimeoutMinutes()
  const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000)

  const payments = organizationId
    ? await db.storefrontPayment.findMany({
        where: {
          organizationId,
          status: "PENDING",
          createdAt: { lte: cutoff },
        },
        orderBy: { createdAt: "asc" },
        take: 100,
      })
    : await db.storefrontPayment.findMany({
        where: {
          status: "PENDING",
          createdAt: { lte: cutoff },
        },
        orderBy: { createdAt: "asc" },
        take: 250,
      })

  let expiredPayments = 0
  let expiredOrders = 0
  let expiredServiceRequests = 0

  for (const payment of payments as PendingStorefrontPayment[]) {
    const metadata = parseJsonObject(payment.metadata)
    const orderIds = parseJsonArray(payment.orderIds)
    const serviceRequestIds = Array.isArray(metadata.serviceRequestIds)
      ? metadata.serviceRequestIds.filter((item): item is string => typeof item === "string")
      : []

    await db.$transaction(async (tx) => {
      const updatedPayment = await tx.storefrontPayment.updateMany({
        where: {
          id: payment.id,
          organizationId: payment.organizationId,
          status: "PENDING",
        },
        data: {
          status: "FAILED",
        },
      })

      if (updatedPayment.count === 0) return

      const orderResult = orderIds.length
        ? await tx.order.updateMany({
            where: {
              id: { in: orderIds },
              organizationId: payment.organizationId,
              status: "PENDING_PAYMENT",
              paymentStatus: "PENDING",
            },
            data: {
              status: "PAYMENT_FAILED",
              paymentStatus: "FAILED",
            },
          })
        : { count: 0 }

      const serviceResult = serviceRequestIds.length
        ? await tx.serviceRequest.updateMany({
            where: {
              id: { in: serviceRequestIds },
              organizationId: payment.organizationId,
              status: "PENDING_PAYMENT",
              paymentStatus: "PENDING",
            },
            data: {
              status: "PAYMENT_FAILED",
              paymentStatus: "FAILED",
            },
          })
        : { count: 0 }

      const auditRows = [
        ...orderIds.map((orderId) => ({
          action: "STOREFRONT_PAYMENT_EXPIRED",
          targetType: "ORDER",
          targetId: orderId,
          organizationId: payment.organizationId,
          meta: JSON.stringify({
            reference: payment.reference,
            reason: "expired_pending_payment",
            timeoutMinutes,
          }),
        })),
        ...serviceRequestIds.map((requestId) => ({
          action: "SERVICE_REQUEST_PAYMENT_EXPIRED",
          targetType: "SERVICE_REQUEST",
          targetId: requestId,
          organizationId: payment.organizationId,
          meta: JSON.stringify({
            reference: payment.reference,
            reason: "expired_pending_payment",
            timeoutMinutes,
          }),
        })),
      ]

      if (auditRows.length > 0) {
        await tx.auditLog.createMany({ data: auditRows })
      }

      expiredPayments += 1
      expiredOrders += orderResult.count
      expiredServiceRequests += serviceResult.count
    })
  }

  return {
    timeoutMinutes,
    expiredPayments,
    expiredOrders,
    expiredServiceRequests,
  }
}
