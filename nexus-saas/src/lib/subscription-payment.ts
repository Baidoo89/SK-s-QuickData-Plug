import { randomUUID } from "node:crypto"
import { db } from "@/lib/db"
import { moneyToMinor, minorToMoney } from "@/lib/money"
import { getNextBillingDate } from "@/lib/subscription-access"
import { parsePaystackMetadata, type PaystackMetadata } from "@/lib/paystack-metadata"

type Actor = { id: string; organizationId: string | null; role: string }
type GatewayPayment = { reference?: unknown; status?: unknown; currency?: unknown; amount?: unknown; metadata?: PaystackMetadata | string | null }
const SUBSCRIPTION_QUOTE_TTL_MS = 30 * 60 * 1000

export async function createSubscriptionQuote(actor: Actor, planId: string) {
  if (!actor.organizationId || !["SUBSCRIBER", "SUPERADMIN"].includes(actor.role)) throw new Error("SUBSCRIPTION_CHECKOUT_FORBIDDEN")
  const organizationId = actor.organizationId
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE`
    const user = await tx.user.findUnique({ where: { id: actor.id }, include: { organization: true } })
    const plan = await tx.plan.findUnique({ where: { id: planId } })
    if (!user || user.organizationId !== organizationId || !user.organization?.active || !user.active || user.signupStatus !== "APPROVED" || !["SUBSCRIBER", "SUPERADMIN"].includes(user.role)) throw new Error("SUBSCRIPTION_CHECKOUT_FORBIDDEN")
    if (!plan || !plan.active || !plan.visible || plan.retiredAt) throw new Error("INVALID_SUBSCRIPTION_QUOTE")
    const amountMinor = moneyToMinor(plan.priceGHS)
    if (amountMinor <= 0) throw new Error("INVALID_SUBSCRIPTION_QUOTE")
    const reference = `SUB-${randomUUID()}`
    const expiresAt = new Date(Date.now() + SUBSCRIPTION_QUOTE_TTL_MS)
    await tx.subscriptionCheckout.updateMany({ where: { organizationId, status: "PENDING", expiresAt: { lte: new Date() } }, data: { status: "EXPIRED" } })
    await tx.subscriptionCheckout.create({ data: { reference, organizationId: organizationId, planId: plan.id, createdByUserId: user.id, amountMinor: BigInt(amountMinor), expiresAt } })
    return { reference, amountMinor, planId: plan.id, planName: plan.name, organizationId: organizationId, email: user.email, expiresAt }
  }, { maxWait: 10000, timeout: 20000 })
}

export async function settleSubscriptionPayment(reference: string, gateway: GatewayPayment) {
  const meta = parsePaystackMetadata(gateway.metadata)
  if (gateway.reference !== reference || gateway.status !== "success" || gateway.currency !== "GHS" || meta.purpose !== "platform_subscription" || !Number.isSafeInteger(gateway.amount)) throw new Error("INVALID_SUBSCRIPTION_PAYMENT")
  const invoice = await db.subscriptionCheckout.findUnique({ where: { reference }, select: { organizationId: true } })
  if (!invoice) throw new Error("INVALID_SUBSCRIPTION_PAYMENT")
  const result = await db.$transaction(async tx => {
    // Serialize every payment for this organization, including different refs.
    await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${invoice.organizationId} FOR UPDATE`
    await tx.$queryRaw`SELECT "reference" FROM "SubscriptionCheckout" WHERE "reference" = ${reference} FOR UPDATE`
    const quote = await tx.subscriptionCheckout.findUnique({ where: { reference } })
    if (!quote || meta.organizationId !== quote.organizationId || meta.planId !== quote.planId || quote.currency !== gateway.currency || quote.amountMinor !== BigInt(gateway.amount as number)) throw new Error("INVALID_SUBSCRIPTION_PAYMENT")
    const existing = await tx.payment.findUnique({ where: { paystackRef: reference }, include: { subscription: true } })
    if (existing) {
      if (existing.status !== "SUCCESS" || existing.subscription.organizationId !== quote.organizationId || BigInt(moneyToMinor(existing.amount)) !== quote.amountMinor) throw new Error("INVALID_SUBSCRIPTION_PAYMENT")
      return { subscriptionId: existing.subscriptionId, applied: false }
    }
    if (quote.status === "SUCCESS") throw new Error("SUBSCRIPTION_PAYMENT_NEEDS_REVIEW")
    if (quote.status === "EXPIRED" || quote.expiresAt <= new Date()) {
      if (quote.status === "PENDING") await tx.subscriptionCheckout.update({ where: { reference }, data: { status: "EXPIRED" } })
      return { expired: true as const, organizationId: quote.organizationId }
    }
    const previous = await tx.subscription.findUnique({ where: { organizationId: quote.organizationId } })
    const nextBillingAt = getNextBillingDate(previous?.nextBillingAt)
    const subscription = await tx.subscription.upsert({ where: { organizationId: quote.organizationId }, update: { planId: quote.planId, status: "ACTIVE", paystackRef: reference, nextBillingAt }, create: { organizationId: quote.organizationId, planId: quote.planId, status: "ACTIVE", paystackRef: reference, nextBillingAt } })
    await tx.payment.create({ data: { subscriptionId: subscription.id, amount: minorToMoney(Number(quote.amountMinor)), paystackRef: reference, status: "SUCCESS", paidAt: new Date() } })
    await tx.subscriptionCheckout.update({ where: { reference }, data: { status: "SUCCESS", paidAt: new Date() } })
    await tx.auditLog.create({ data: { action: "SUBSCRIPTION_PAYMENT_APPLIED", targetType: "SUBSCRIPTION", targetId: subscription.id, organizationId: quote.organizationId, meta: JSON.stringify({ reference, planId: quote.planId, amountMinor: quote.amountMinor.toString(), nextBillingAt: nextBillingAt.toISOString() }) } })
    return { subscriptionId: subscription.id, applied: true as const }
  }, { maxWait: 10000, timeout: 20000 })
  if ("expired" in result && result.expired) throw new Error("SUBSCRIPTION_QUOTE_EXPIRED")
  return result
}
