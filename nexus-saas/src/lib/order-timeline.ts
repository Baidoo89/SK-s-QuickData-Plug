import { db } from "@/lib/db"
import { getStorefrontPaymentMap } from "@/lib/storefront-payment-map"

export type OrderTimelineEvent = {
  id: string
  action: string
  label: string
  actorName: string | null
  createdAt: Date
  meta: Record<string, unknown>
}

function parseMeta(value: string | null) {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function labelForAction(action: string) {
  const labels: Record<string, string> = {
    STOREFRONT_CHECKOUT_CREATED: "Storefront checkout created",
    STOREFRONT_PAYMENT_SUCCESS: "Payment verified",
    ORDER_MANUAL_CLAIMED: "Claimed for manual fulfillment",
    ORDER_MANUAL_STATUS_UPDATE: "Status updated",
    ORDER_MANUAL_IMPORT_STATUS: "Manual result imported",
    ORDER_DISPATCH_DECISION: "Dispatch decision recorded",
    ORDER_DISPATCH_SKIPPED: "Provider dispatch skipped",
    ORDER_DISPATCH_ATTEMPT: "Provider dispatch attempted",
    ORDER_DISPATCH_ERROR: "Provider dispatch failed",
    ORDER_PROVIDER_CALLBACK: "Provider callback received",
    ORDER_RETRY_DISPATCH: "Dispatch retried",
    ORDER_WALLET_DEBIT: "Wallet debited",
    ORDER_WALLET_REVERSAL: "Wallet debit reversed",
    ORDER_PROFIT_REVERSAL: "Profit reversed",
  }

  return labels[action] || action.replace(/_/g, " ").toLowerCase()
}

export async function getOrderTimeline(params: {
  orderId: string
  organizationId?: string | null
  superadmin?: boolean
}) {
  const order = await db.order.findFirst({
    where: {
      id: params.orderId,
      ...(params.superadmin ? {} : { organizationId: params.organizationId! }),
    },
    include: {
      customer: true,
      agent: true,
      organization: true,
      items: { include: { product: true } },
    },
  })

  if (!order) return null

  const logs = await db.auditLog.findMany({
    where: {
      targetType: "ORDER",
      targetId: params.orderId,
      ...(params.superadmin ? {} : { organizationId: params.organizationId! }),
    },
    orderBy: { createdAt: "asc" },
  })

  const paymentMap = await getStorefrontPaymentMap([params.orderId], params.superadmin ? null : params.organizationId)
  const payment = paymentMap.get(params.orderId) || null

  const events: OrderTimelineEvent[] = [
    {
      id: `${order.id}-created`,
      action: "ORDER_CREATED",
      label: "Order record created",
      actorName: null,
      createdAt: order.createdAt,
      meta: {
        status: order.status,
        total: order.total,
        phoneNumber: order.phoneNumber,
      },
    },
    ...logs.map((log) => ({
      id: log.id,
      action: log.action,
      label: labelForAction(log.action),
      actorName: log.actorName,
      createdAt: log.createdAt,
      meta: parseMeta(log.meta),
    })),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

  return {
    order: {
      id: order.id,
      status: order.status,
      total: order.total,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      phoneNumber: order.phoneNumber,
      organization: order.organization ? { id: order.organization.id, name: order.organization.name } : null,
      customer: order.customer ? { name: order.customer.name, email: order.customer.email, phone: order.customer.phone } : null,
      agent: order.agent ? { id: order.agent.id, name: order.agent.name } : null,
      items: order.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        price: item.price,
        profit: item.profit,
        productName: item.product.name,
      })),
    },
    payment,
    events,
  }
}
