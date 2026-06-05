import { db } from "@/lib/db"
import { getStoredOrganizationPaymentSettings } from "@/lib/organization-payment-settings"
import { isSubscriptionActive } from "@/lib/subscription-access"

export type SellingAccessStatus = {
  canSell: boolean
  organizationActive: boolean
  subscriptionActive: boolean
  paystackConnected: boolean
  productsReady: boolean
  pricingReady: boolean
  reason: string | null
  nextActionHref: string | null
  nextActionLabel: string | null
}

export async function getOrganizationSellingAccess(organizationId: string): Promise<SellingAccessStatus> {
  const [organization, productCount, basePriceCount, paymentSettings] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      include: { subscription: true },
    }),
    db.product.count({
      where: { organizationId, active: true },
    }),
    db.basePrice.count({
      where: { organizationId },
    }),
    getStoredOrganizationPaymentSettings(organizationId),
  ])

  const organizationActive = Boolean(organization?.active)
  const subscriptionActive = isSubscriptionActive(organization?.subscription)
  const paystackConnected = Boolean(paymentSettings?.paystackConnected)
  const productsReady = productCount > 0
  const pricingReady = basePriceCount > 0

  if (!organizationActive) {
    return {
      canSell: false,
      organizationActive,
      subscriptionActive,
      paystackConnected,
      productsReady,
      pricingReady,
      reason: "This organization is inactive. Contact the platform superadmin before selling can resume.",
      nextActionHref: "/dashboard/settings",
      nextActionLabel: "Review Settings",
    }
  }

  if (!subscriptionActive) {
    return {
      canSell: false,
      organizationActive,
      subscriptionActive,
      paystackConnected,
      productsReady,
      pricingReady,
      reason: "Selling is blocked because the SaaS subscription is missing, expired, or canceled.",
      nextActionHref: "/dashboard/subscription",
      nextActionLabel: "Manage Subscription",
    }
  }

  if (!paystackConnected) {
    return {
      canSell: false,
      organizationActive,
      subscriptionActive,
      paystackConnected,
      productsReady,
      pricingReady,
      reason: "Selling is blocked until subscriber Paystack keys are connected for customer payments.",
      nextActionHref: "/dashboard/settings",
      nextActionLabel: "Connect Paystack",
    }
  }

  if (!productsReady) {
    return {
      canSell: false,
      organizationActive,
      subscriptionActive,
      paystackConnected,
      productsReady,
      pricingReady,
      reason: "Selling is blocked until at least one active product or data bundle is available.",
      nextActionHref: "/dashboard/products",
      nextActionLabel: "Manage Products",
    }
  }

  if (!pricingReady) {
    return {
      canSell: false,
      organizationActive,
      subscriptionActive,
      paystackConnected,
      productsReady,
      pricingReady,
      reason: "Selling is blocked until customer-facing pricing is configured.",
      nextActionHref: "/dashboard/products",
      nextActionLabel: "Set Pricing",
    }
  }

  return {
    canSell: true,
    organizationActive,
    subscriptionActive,
    paystackConnected,
    productsReady,
    pricingReady,
    reason: null,
    nextActionHref: null,
    nextActionLabel: null,
  }
}
