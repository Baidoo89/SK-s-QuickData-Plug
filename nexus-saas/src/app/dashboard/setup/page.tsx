import { SetupChecklist, type SetupItem } from "@/components/dashboard/setup-checklist"
import {
  Activity,
  CreditCard,
  ExternalLink,
  Package,
  Settings,
  Store,
  Users,
  WalletCards,
} from "lucide-react"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { getStoredOrganizationPaymentSettings } from "@/lib/organization-payment-settings"
import { isSubscriptionActive } from "@/lib/subscription-access"
import { formatGhanaCedis } from "@/lib/currency"
import { getOrCreateSubscriberStorefrontLink } from "@/lib/storefront-links"

export default async function DashboardSetupPage() {
  const session = await auth()
  if (!session?.user?.email) {
    redirect("/login")
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    include: {
      organization: {
        include: {
          subscription: true,
          apiKeys: {
            select: { id: true },
          },
        },
      },
    },
  })

  if (!user?.organization || !user.organizationId) {
    return (
      <div className="max-w-3xl space-y-3 p-4 md:p-8">
        <h1 className="text-2xl font-bold tracking-tight">Launch Setup</h1>
        <p className="text-sm text-muted-foreground">No organization is attached to this account yet.</p>
      </div>
    )
  }

  const [productCount, basePriceCount, agentCount, walletAgg, paymentSettings] = await Promise.all([
    db.product.count({
      where: { organizationId: user.organizationId, active: true },
    }),
    db.basePrice.count({
      where: { organizationId: user.organizationId },
    }),
    db.agent.count({
      where: { organizationId: user.organizationId, active: true },
    }),
    db.walletTransaction.aggregate({
      _sum: { amount: true },
      where: {
        userId: user.id,
        status: "success",
      },
    }),
    getStoredOrganizationPaymentSettings(user.organizationId),
  ])

  const organizationActive = user.organization.active
  const subscriptionActive = isSubscriptionActive(user.organization.subscription)
  const paystackConnected = Boolean(paymentSettings?.paystackConnected)
  const productsReady = productCount > 0
  const pricingReady = basePriceCount > 0
  const walletBalance = walletAgg._sum.amount ?? 0
  const walletFunded = walletBalance > 0
  const apiReady = user.organization.apiKeys.length > 0
  const agentsReady = agentCount > 0
  const storePath = user.organization.slug
    ? await getOrCreateSubscriberStorefrontLink({
        organizationId: user.organization.id,
        organizationName: user.organization.name,
        organizationSlug: user.organization.slug,
      })
    : null

  const requiredItems: SetupItem[] = [
    {
      label: "Activate your business account",
      description: organizationActive
        ? "Active."
        : "Your business account is inactive. Contact the platform owner to reactivate it.",
      href: "/dashboard/settings",
      complete: organizationActive,
      required: true,
      icon: Store,
      action: "Review business settings",
    },
    {
      label: "Choose your selling plan",
      description: subscriptionActive
        ? "Active."
        : "Choose and activate a plan so your shop can accept orders.",
      href: "/dashboard/subscription",
      complete: subscriptionActive,
      required: true,
      icon: CreditCard,
      action: "Manage plan",
    },
    {
      label: "Connect customer payments",
      description: paystackConnected
        ? "Connected."
        : "Connect your Paystack account so customers can pay with Mobile Money or a card.",
      href: "/dashboard/settings#payments",
      complete: paystackConnected,
      required: true,
      icon: WalletCards,
      action: "Connect Paystack",
    },
    {
      label: "Add the bundles you want to sell",
      description: productsReady
        ? `${productCount} active.`
        : "Add at least one bundle and choose its network. Only active products appear in your shop.",
      href: "/dashboard/products",
      complete: productsReady,
      required: true,
      icon: Package,
      action: "Add bundles",
    },
    {
      label: "Set your selling prices",
      description: pricingReady
        ? `${basePriceCount} set.`
        : "Set the customer price for each bundle you plan to sell, then review your shop.",
      href: "/dashboard/products",
      complete: pricingReady,
      required: true,
      icon: Settings,
      action: "Set prices",
    },
  ]

  const recommendedItems: SetupItem[] = [
    {
      label: "Wallet funded",
      description: walletFunded
        ? `${formatGhanaCedis(walletBalance)} available.`
        : "Fund wallet when needed.",
      href: "/dashboard/wallet",
      complete: walletFunded,
      required: false,
      icon: WalletCards,
      action: "Review wallet",
    },
    {
      label: "Agents onboarded",
      description: agentsReady
        ? `${agentCount} active.`
        : "Add agents when ready.",
      href: "/dashboard/agents",
      complete: agentsReady,
      required: false,
      icon: Users,
      action: "Manage agents",
    },
    {
      label: "Website keys",
      description: apiReady
        ? `${user.organization.apiKeys.length} available.`
        : "Optional.",
      href: "/dashboard/settings#website-api",
      complete: apiReady,
      required: false,
      icon: Activity,
      action: "Website keys",
    },
    {
      label: "Shop reviewed",
      description: storePath
        ? "Open your shop and confirm it looks right."
        : "Set your business name first.",
      href: storePath ?? "/dashboard/settings",
      complete: Boolean(storePath && organizationActive && subscriptionActive && paystackConnected && productsReady && pricingReady),
      required: false,
      icon: ExternalLink,
      action: "Open shop",
      external: Boolean(storePath),
    },
  ]

  return <SetupChecklist requiredItems={requiredItems} optionalItems={recommendedItems} storePath={storePath} />
}
