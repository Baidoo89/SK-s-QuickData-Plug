import { ApiErrors } from "@/lib/api-response"
import { db } from "@/lib/db"
import { DEFAULT_SAAS_PLAN_CODE, getSaasPlanByCode, SAAS_PLANS } from "@/lib/saas-plans"

type ListSaasPlansOptions = {
  includeInactive?: boolean
}

export async function ensureSaasPlans() {
  const existingPlans = await db.plan.findMany({
    orderBy: [{ priceGHS: "asc" }, { createdAt: "asc" }],
  })

  if (existingPlans.length > 0) {
    return existingPlans
  }

  return Promise.all(
    SAAS_PLANS.map((plan) =>
      db.plan.create({
        data: {
          name: plan.name,
          description: plan.description,
          priceGHS: plan.priceGHS,
          maxProducts: plan.maxProducts,
          maxAgents: plan.maxAgents,
          features: JSON.stringify(plan.features),
          active: true,
          visible: true,
          recommended: plan.recommended,
        },
      })
    )
  )
}

export async function listSaasPlans(options: ListSaasPlansOptions = {}) {
  await ensureSaasPlans()

  return db.plan.findMany({
    where: options.includeInactive
      ? undefined
      : {
          active: true,
          visible: true,
          retiredAt: null,
        },
    orderBy: [{ priceGHS: "asc" }, { createdAt: "asc" }],
  })
}

export async function getSaasPlanForCheckout(planIdOrCode: string | null | undefined = DEFAULT_SAAS_PLAN_CODE) {
  await ensureSaasPlans()

  if (planIdOrCode) {
    const planById = await db.plan.findFirst({
      where: {
        id: planIdOrCode,
        active: true,
        visible: true,
        retiredAt: null,
      },
    })
    if (planById) return planById
  }

  const planConfig = getSaasPlanByCode(planIdOrCode) ?? getSaasPlanByCode(DEFAULT_SAAS_PLAN_CODE)!
  const planByName = await db.plan.findFirst({
    where: {
      name: planConfig.name,
      active: true,
      visible: true,
      retiredAt: null,
    },
  })
  if (planByName) return planByName

  const cheapestPlan = await db.plan.findFirst({
    where: {
      active: true,
      visible: true,
      retiredAt: null,
    },
    orderBy: { priceGHS: "asc" },
  })
  if (cheapestPlan) return cheapestPlan

  return db.plan.create({
    data: {
      name: planConfig.name,
      description: planConfig.description,
      priceGHS: planConfig.priceGHS,
      maxProducts: planConfig.maxProducts,
      maxAgents: planConfig.maxAgents,
      features: JSON.stringify(planConfig.features),
      active: true,
      visible: true,
      recommended: planConfig.recommended,
    },
  })
}

export async function ensureSaasPlan(code: string | null | undefined = DEFAULT_SAAS_PLAN_CODE) {
  return getSaasPlanForCheckout(code)
}

export async function ensureDefaultSaasPlan() {
  return getSaasPlanForCheckout(DEFAULT_SAAS_PLAN_CODE)
}

export async function resetSaasPlansToDefaults() {
  return Promise.all(
    SAAS_PLANS.map((plan) =>
      db.plan.upsert({
        where: { name: plan.name },
        update: {
          description: plan.description,
          priceGHS: plan.priceGHS,
          maxProducts: plan.maxProducts,
          maxAgents: plan.maxAgents,
          features: JSON.stringify(plan.features),
          active: true,
          visible: true,
          recommended: plan.recommended,
          retiredAt: null,
        },
        create: {
          name: plan.name,
          description: plan.description,
          priceGHS: plan.priceGHS,
          maxProducts: plan.maxProducts,
          maxAgents: plan.maxAgents,
          features: JSON.stringify(plan.features),
          active: true,
          visible: true,
          recommended: plan.recommended,
        },
      })
    )
  )
}

export function getNextBillingDate(currentNextBillingAt?: Date | null, months = 1) {
  const now = new Date()
  const base = currentNextBillingAt && currentNextBillingAt > now ? currentNextBillingAt : now
  const next = new Date(base)
  next.setMonth(next.getMonth() + months)
  return next
}

export async function refreshOrganizationSubscriptionStatus(organizationId: string) {
  const subscription = await db.subscription.findUnique({
    where: { organizationId },
  })

  if (
    subscription?.status === "ACTIVE" &&
    subscription.nextBillingAt &&
    subscription.nextBillingAt <= new Date()
  ) {
    return db.subscription.update({
      where: { id: subscription.id },
      data: { status: "EXPIRED" },
    })
  }

  return subscription
}

export async function expireOverdueSubscriptions() {
  return db.subscription.updateMany({
    where: {
      status: "ACTIVE",
      nextBillingAt: { lte: new Date() },
    },
    data: { status: "EXPIRED" },
  })
}

export function isSubscriptionActive(subscription: { status: string; nextBillingAt: Date | null } | null | undefined) {
  return Boolean(
    subscription &&
      subscription.status === "ACTIVE" &&
      (!subscription.nextBillingAt || subscription.nextBillingAt > new Date())
  )
}

export async function organizationHasActiveSubscription(organizationId: string) {
  const subscription = await refreshOrganizationSubscriptionStatus(organizationId)

  return isSubscriptionActive(subscription)
}

export async function requireActiveSubscription(organizationId: string) {
  const hasAccess = await organizationHasActiveSubscription(organizationId)
  return hasAccess ? null : ApiErrors.SUBSCRIPTION_REQUIRED()
}
