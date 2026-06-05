import Link from "next/link"
import type { ComponentType } from "react"
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Package,
  Rocket,
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
import { getOrganizationSellingAccess } from "@/lib/selling-access"
import { formatGhanaCedis } from "@/lib/currency"
import { SellingAccessAlert } from "@/components/access/selling-access-alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getOrCreateSubscriberStorefrontLink } from "@/lib/storefront-links"

type SetupItem = {
  label: string
  description: string
  href: string
  complete: boolean
  required: boolean
  icon: ComponentType<{ className?: string }>
  action: string
  external?: boolean
}

function SetupStepCard({ item, index }: { item: SetupItem; index: number }) {
  const Icon = item.icon
  const body = (
    <div className="flex h-full gap-3 rounded-md border border-border bg-background p-4 transition-colors hover:bg-muted/40">
      <div className={item.complete ? "text-primary" : item.required ? "text-amber-700" : "text-muted-foreground"}>
        {item.complete ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-[11px] font-semibold text-muted-foreground">
            {index + 1}
          </span>
          <Icon className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">{item.label}</p>
          <Badge variant={item.required ? "secondary" : "outline"} className="text-[10px]">
            {item.required ? "Required" : "Recommended"}
          </Badge>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">{item.description}</p>
        <p className="text-xs font-medium text-primary">{item.action}</p>
      </div>
    </div>
  )

  return item.external ? (
    <Link href={item.href} target="_blank" className="block h-full">
      {body}
    </Link>
  ) : (
    <Link href={item.href} className="block h-full">
      {body}
    </Link>
  )
}

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

  const [productCount, basePriceCount, agentCount, walletAgg, paymentSettings, sellingAccess] = await Promise.all([
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
    getOrganizationSellingAccess(user.organizationId),
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
      label: "Business account active",
      description: organizationActive
        ? "Your organization is active and allowed to operate on the platform."
        : "Superadmin must reactivate this organization before selling can resume.",
      href: "/dashboard/settings",
      complete: organizationActive,
      required: true,
      icon: Store,
      action: "Review business settings",
    },
    {
      label: "SaaS subscription active",
      description: subscriptionActive
        ? "Your plan is active, so storefront, agent, reseller, and API selling can be enabled."
        : "Activate a plan before accepting paid orders or using selling channels.",
      href: "/dashboard/subscription",
      complete: subscriptionActive,
      required: true,
      icon: CreditCard,
      action: "Manage subscription",
    },
    {
      label: "Paystack connected",
      description: paystackConnected
        ? "Customer payments will settle through your own Paystack account."
        : "Add your Paystack public and secret keys so storefront customers pay you directly.",
      href: "/dashboard/settings",
      complete: paystackConnected,
      required: true,
      icon: WalletCards,
      action: "Connect Paystack",
    },
    {
      label: "Products created",
      description: productsReady
        ? `${productCount} active product${productCount === 1 ? "" : "s"} available for selling.`
        : "Create at least one active data bundle or product for customers to buy.",
      href: "/dashboard/products",
      complete: productsReady,
      required: true,
      icon: Package,
      action: "Manage products",
    },
    {
      label: "Base prices configured",
      description: pricingReady
        ? `${basePriceCount} price record${basePriceCount === 1 ? "" : "s"} configured for your products.`
        : "Set customer-facing base prices before you share the storefront.",
      href: "/dashboard/products",
      complete: pricingReady,
      required: true,
      icon: Settings,
      action: "Set prices",
    },
  ]

  const recommendedItems: SetupItem[] = [
    {
      label: "Operational wallet funded",
      description: walletFunded
        ? `Your current wallet activity balance is ${formatGhanaCedis(walletBalance)}.`
        : "Fund operational wallets when you need wallet-backed VTU or internal agent/reseller credits.",
      href: "/dashboard/wallet",
      complete: walletFunded,
      required: false,
      icon: WalletCards,
      action: "Review wallet",
    },
    {
      label: "Agents onboarded",
      description: agentsReady
        ? `${agentCount} active agent${agentCount === 1 ? "" : "s"} can sell under your organization.`
        : "Add agents when you are ready to expand beyond your own storefront.",
      href: "/dashboard/agents",
      complete: agentsReady,
      required: false,
      icon: Users,
      action: "Manage agents",
    },
    {
      label: "API keys created",
      description: apiReady
        ? `${user.organization.apiKeys.length} API key${user.organization.apiKeys.length === 1 ? "" : "s"} available.`
        : "Create API keys only when you are ready for external systems to place orders.",
      href: "/dashboard/settings",
      complete: apiReady,
      required: false,
      icon: Activity,
      action: "Manage API access",
    },
    {
      label: "Storefront reviewed",
      description: storePath
        ? "Open your public storefront and confirm the products, prices, and checkout experience."
        : "Your organization needs a storefront slug before the public store can be opened.",
      href: storePath ?? "/dashboard/settings",
      complete: Boolean(storePath && organizationActive && subscriptionActive && paystackConnected && productsReady && pricingReady),
      required: false,
      icon: ExternalLink,
      action: "Open storefront",
      external: Boolean(storePath),
    },
  ]

  const requiredComplete = requiredItems.filter((item) => item.complete).length
  const recommendedComplete = recommendedItems.filter((item) => item.complete).length
  const launchReady = requiredComplete === requiredItems.length
  const progress = Math.round((requiredComplete / requiredItems.length) * 100)

  return (
    <div className="portal-page space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Subscriber Launch</p>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Launch Setup</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Finish the required steps before sharing your storefront. Recommended steps help you expand into agents,
            wallet-backed operations, and API ordering after the core selling flow is ready.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {storePath ? (
            <Button asChild variant="outline">
              <Link href={storePath} target="_blank">
                <ExternalLink className="mr-2 h-4 w-4" />
                Open Storefront
              </Link>
            </Button>
          ) : null}
          <Button asChild>
            <Link href={launchReady ? "/dashboard/orders" : "/dashboard/products"}>
              {launchReady ? "Open Orders" : "Continue Setup"}
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Rocket className={launchReady ? "h-5 w-5 text-primary" : "h-5 w-5 text-muted-foreground"} />
                Storefront Launch Status
              </CardTitle>
              <CardDescription>
                Required progress is based on account status, subscription, Paystack, products, and prices.
              </CardDescription>
            </div>
            <Badge variant={launchReady ? "secondary" : "outline"} className={launchReady ? "bg-primary/10 text-primary" : "border-amber-500/40 text-amber-800"}>
              {launchReady ? "Ready to sell" : `${requiredComplete}/${requiredItems.length} required`}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className={launchReady ? "status-success rounded-md border p-3 text-sm" : "status-warning rounded-md border p-3 text-sm"}>
            {launchReady
              ? "Your public checkout can accept paid orders. Orders will enter the manual fulfillment workflow after payment."
              : "Checkout remains blocked until all required steps are complete."}
          </div>
        </CardContent>
      </Card>

      <SellingAccessAlert
        canSell={sellingAccess.canSell}
        reason={sellingAccess.reason}
        nextActionHref={sellingAccess.nextActionHref}
        nextActionLabel={sellingAccess.nextActionLabel}
      />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Required Before Selling</h2>
          <span className="text-xs text-muted-foreground">{requiredComplete}/{requiredItems.length} complete</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {requiredItems.map((item, index) => (
            <SetupStepCard key={item.label} item={item} index={index} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Recommended For Growth</h2>
          <span className="text-xs text-muted-foreground">{recommendedComplete}/{recommendedItems.length} complete</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {recommendedItems.map((item, index) => (
            <SetupStepCard key={item.label} item={item} index={index} />
          ))}
        </div>
      </section>
    </div>
  )
}
