import type { Plan } from "@prisma/client"

export const SAAS_PLANS = [
  {
    code: "starter",
    name: "Starter",
    description: "For a new data seller launching one clean storefront.",
    priceGHS: 99,
    maxProducts: 100,
    maxAgents: 5,
    includedSubscribers: 1,
    recommended: false,
    features: [
      "1 subscriber workspace",
      "100 active products",
      "5 agents",
      "Storefront checkout",
      "Subscriber Paystack settlement",
      "Manual fulfillment workspace",
    ],
  },
  {
    code: "growth",
    name: "Growth",
    description: "For operators building an agent and reseller sales network.",
    priceGHS: 199,
    maxProducts: 300,
    maxAgents: 25,
    includedSubscribers: 1,
    recommended: true,
    features: [
      "1 subscriber workspace",
      "300 active products",
      "25 agents",
      "Reseller onboarding",
      "Storefront and API access",
      "Wallet, withdrawals, and order controls",
    ],
  },
  {
    code: "scale",
    name: "Scale",
    description: "For high-volume teams that need more catalog and channel capacity.",
    priceGHS: 399,
    maxProducts: 1000,
    maxAgents: 100,
    includedSubscribers: 1,
    recommended: false,
    features: [
      "1 subscriber workspace",
      "1,000 active products",
      "100 agents",
      "Reseller onboarding",
      "Storefront and API access",
      "Priority operational support",
    ],
  },
] as const

export type SaasPlanCode = (typeof SAAS_PLANS)[number]["code"]

export const DEFAULT_SAAS_PLAN_CODE: SaasPlanCode = "growth"

export function getSaasPlanByCode(code: string | null | undefined) {
  return SAAS_PLANS.find((plan) => plan.code === code) ?? null
}

export type PublicSaasPlan = {
  id: string
  name: string
  description: string
  priceGHS: number
  maxProducts: number
  maxAgents: number
  includedSubscribers: number
  features: string[]
  recommended: boolean
  active: boolean
  visible: boolean
  retiredAt: string | null
}

export function parsePlanFeatures(features: string | null | undefined): string[] {
  if (!features) return []

  try {
    const parsed = JSON.parse(features)
    if (Array.isArray(parsed)) {
      return parsed.map((feature) => String(feature).trim()).filter(Boolean)
    }
  } catch {
    return features
      .split(/\r?\n|,/)
      .map((feature) => feature.trim())
      .filter(Boolean)
  }

  return []
}

export function formatPlanFeatures(features: string[] | string): string {
  const values = Array.isArray(features)
    ? features
    : features
        .split(/\r?\n/)
        .map((feature) => feature.trim())
        .filter(Boolean)

  return JSON.stringify(values)
}

export function planCodeFromName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export function toPublicSaasPlan(plan: Plan): PublicSaasPlan {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description ?? "",
    priceGHS: plan.priceGHS,
    maxProducts: plan.maxProducts,
    maxAgents: plan.maxAgents,
    includedSubscribers: 1,
    features: parsePlanFeatures(plan.features),
    recommended: plan.recommended,
    active: plan.active,
    visible: plan.visible,
    retiredAt: plan.retiredAt?.toISOString() ?? null,
  }
}
