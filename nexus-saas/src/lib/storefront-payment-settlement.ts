import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { moneyToMinor, minorToMoney } from "@/lib/money"

type GatewayPayment = { reference?: unknown; status?: unknown; currency?: unknown; amount?: unknown; metadata?: Record<string, unknown> }
function ids(value: unknown): string[] {
  if (!Array.isArray(value) || value.some(id => typeof id !== "string" || !id)) throw new Error("INVALID_STOREFRONT_PAYMENT")
  return [...new Set(value as string[])].sort()
}
function sameIds(left: unknown, right: string[]) {
  const parsed = ids(left)
  return parsed.length === right.length && parsed.every((id, index) => id === right[index])
}

// The caller must obtain gatewayPayment using server-to-server verification.
export async function settleStorefrontPayment(input: { reference: string; organizationId: string; gatewayPayment: GatewayPayment }) {
  const gateway = input.gatewayPayment
  const meta = gateway.metadata ?? {}
  if (gateway.reference !== input.reference || gateway.currency !== "GHS" || meta.organizationId !== input.organizationId) throw new Error("INVALID_STOREFRONT_PAYMENT")
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "StorefrontPayment" WHERE "reference" = ${input.reference} FOR UPDATE`
    const payment = await tx.storefrontPayment.findUnique({ where: { reference: input.reference } })
    if (!payment || payment.organizationId !== input.organizationId) throw new Error("INVALID_STOREFRONT_PAYMENT")
    const orderIds = ids(JSON.parse(payment.orderIds))
    const savedMeta = payment.metadata ? JSON.parse(payment.metadata) : {}
    const serviceIds = ids(savedMeta.serviceRequestIds ?? [])
    if ((!orderIds.length && !serviceIds.length) ||
        (orderIds.length && meta.purpose !== "storefront_order") ||
        (serviceIds.length && meta.purpose !== "storefront_service_request") ||
        (meta.orderIds !== undefined && !sameIds(meta.orderIds, orderIds)) ||
        (meta.serviceRequestIds !== undefined && !sameIds(meta.serviceRequestIds, serviceIds))) throw new Error("INVALID_STOREFRONT_PAYMENT")
    const count = orderIds.length + serviceIds.length
    // Successful settlement is terminal. A replay cannot dispatch again or
    // reverse payment merely because a later verification reports failure.
    if (payment.status === "SUCCESS") return { success: true, orderIdsToDispatch: orderIds, count }
    const succeeded = gateway.status === "success"
    const failed = ["failed", "abandoned", "reversed"].includes(String(gateway.status))
    if (!succeeded && !failed) return { success: false, orderIdsToDispatch: [] as string[], count }
    if (succeeded && (!Number.isSafeInteger(gateway.amount) || gateway.amount !== moneyToMinor(payment.amount))) throw new Error("INVALID_STOREFRONT_PAYMENT")
    if (failed && payment.status === "FAILED") return { success: false, orderIdsToDispatch: [] as string[], count }
    // Lock members after the payment, matching timeout cleanup's lock order.
    if (orderIds.length) await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" IN (${Prisma.join(orderIds)}) ORDER BY "id" FOR UPDATE`
    if (serviceIds.length) await tx.$queryRaw`SELECT "id" FROM "ServiceRequest" WHERE "id" IN (${Prisma.join(serviceIds)}) ORDER BY "id" FOR UPDATE`
    const orders = await tx.order.findMany({ where: { id: { in: orderIds }, organizationId: input.organizationId, paymentOwner: "STOREFRONT" } })
    const services = await tx.serviceRequest.findMany({ where: { id: { in: serviceIds }, organizationId: input.organizationId, paymentOwner: "STOREFRONT" } })
    if (orders.length !== orderIds.length || services.length !== serviceIds.length) throw new Error("INVALID_STOREFRONT_PAYMENT")
    const members = [...orders, ...services]
    if (members.some(row => !["PENDING_PAYMENT", "PAYMENT_FAILED"].includes(row.status) || !["PENDING", "FAILED"].includes(row.paymentStatus))) throw new Error("STOREFRONT_PAYMENT_NEEDS_REVIEW")
    const totalMinor = members.reduce((sum, row) => sum + moneyToMinor(row.total), 0)
    if (moneyToMinor(minorToMoney(totalMinor)) !== moneyToMinor(payment.amount)) throw new Error("INVALID_STOREFRONT_PAYMENT")
    await tx.storefrontPayment.update({ where: { id: payment.id }, data: { status: succeeded ? "SUCCESS" : "FAILED", ...(succeeded ? { paidAt: new Date() } : {}) } })
    if (orderIds.length) await tx.order.updateMany({ where: { id: { in: orderIds }, organizationId: input.organizationId }, data: { status: succeeded ? "PENDING" : "PAYMENT_FAILED", paymentStatus: succeeded ? "PAID" : "FAILED" } })
    if (serviceIds.length) await tx.serviceRequest.updateMany({ where: { id: { in: serviceIds }, organizationId: input.organizationId }, data: { status: succeeded ? "PENDING_REVIEW" : "PAYMENT_FAILED", paymentStatus: succeeded ? "PAID" : "FAILED", ...(succeeded ? { paymentReference: input.reference } : {}) } })
    await tx.auditLog.createMany({ data: [
      ...orderIds.map(id => ({ action: succeeded ? "STOREFRONT_PAYMENT_SUCCESS" : "STOREFRONT_PAYMENT_FAILED", targetType: "ORDER", targetId: id, organizationId: input.organizationId, meta: JSON.stringify({ reference: input.reference, amountGHS: payment.amount, providerStatus: gateway.status, previousPaymentStatus: payment.status }) })),
      ...serviceIds.map(id => ({ action: succeeded ? "SERVICE_REQUEST_PAYMENT_SUCCESS" : "SERVICE_REQUEST_PAYMENT_FAILED", targetType: "SERVICE_REQUEST", targetId: id, organizationId: input.organizationId, meta: JSON.stringify({ reference: input.reference, amountGHS: payment.amount, providerStatus: gateway.status, previousPaymentStatus: payment.status }) })),
    ] })
    return { success: succeeded, orderIdsToDispatch: succeeded ? orderIds : [], count }
  }, { maxWait: 10000, timeout: 20000 })
}

// A durable claim permits recovery when settlement committed before dispatch
// began, while preventing another verification from sending the same request.
// An interrupted/uncertain claim requires reconciliation rather than blind retry.
export async function claimStorefrontDispatch(orderId: string, organizationId: string, reference: string) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`
    const order = await tx.order.findUnique({ where: { id: orderId } })
    if (!order || order.organizationId !== organizationId || order.paymentStatus !== "PAID" || order.paymentOwner !== "STOREFRONT" || order.status !== "PENDING") return false
    const existing = await tx.auditLog.findFirst({ where: { targetType: "ORDER", targetId: orderId, action: "STOREFRONT_DISPATCH_STARTED" } })
    if (existing) return false
    await tx.auditLog.create({ data: { action: "STOREFRONT_DISPATCH_STARTED", targetType: "ORDER", targetId: orderId, organizationId, meta: JSON.stringify({ reference }) } })
    return true
  }, { maxWait: 10000, timeout: 20000 })
}
