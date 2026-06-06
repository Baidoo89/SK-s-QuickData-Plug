import { notFound } from "next/navigation"
import { AlertCircle, CheckCircle2, CreditCard, FileText, Package, ShieldCheck } from "lucide-react"

import { SimpleBuySectionsClient } from "@/components/storefront/simple-buy-sections-client"
import { MetricCard } from "@/components/ui/metric-card"
import { db } from "@/lib/db"
import { getStoredOrganizationPaymentSettings } from "@/lib/organization-payment-settings"
import { getResellerPricingProfileContext, resolveResellerBuyPrice } from "@/lib/reseller-pricing"
import { isSubscriptionActive } from "@/lib/subscription-access"
import {
  getAgentStorefrontPrices,
  getResellerStorefrontPrices,
  getSubscriberStorefrontPrices,
  mapStorefrontPrices,
} from "@/lib/storefront-pricing"

export const dynamic = "force-dynamic"

type StoreBundle = {
  id: string
  name: string
  provider: string
  category: string
  serviceForm?: string | null
  effectivePrice: number
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  return parts.map((part) => part[0]?.toUpperCase()).join("") || "ST"
}

async function getStoreStatus(organization: { id: string; active: boolean; subscription: unknown }) {
  const paymentSettings = await getStoredOrganizationPaymentSettings(organization.id)
  const hasPaymentSettings = Boolean(paymentSettings?.paystackConnected)
  const hasActiveSubscription = isSubscriptionActive(organization.subscription as never)
  const storeActive = Boolean(organization.active && hasActiveSubscription && hasPaymentSettings)
  const storeInactiveReason = !organization.active
    ? "This storefront is currently inactive. Purchases are disabled."
    : !hasActiveSubscription
      ? "This storefront is temporarily unavailable because the business subscription is inactive."
      : !hasPaymentSettings
        ? "This storefront is not ready for payments yet. The seller needs to connect Paystack."
        : undefined

  return { storeActive, storeInactiveReason }
}

async function loadSubscriberBundles(organizationId: string) {
  const products = await db.product.findMany({
    where: { organizationId, active: true },
    include: {
      basePrices: {
        where: { organizationId },
        select: { price: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  const storefrontPriceMap = mapStorefrontPrices(await getSubscriberStorefrontPrices(organizationId))
  return products.map((product: any) => ({
    id: product.id,
    name: product.name,
    provider: product.provider,
    category: product.category,
    serviceForm: product.serviceForm,
    effectivePrice: storefrontPriceMap.get(product.id) ?? product.price,
  }))
}

async function loadAgentBundles(organizationId: string, agentId: string) {
  const products = await db.product.findMany({
    where: { organizationId, active: true },
    include: {
      agentPrices: {
        where: { agentId, organizationId },
        select: { price: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  const storefrontPriceMap = mapStorefrontPrices(await getAgentStorefrontPrices(agentId, organizationId))
  return products.map((product: any) => {
    const agentBuyPrice = product.agentPrices?.[0]?.price ?? product.price
    return {
      id: product.id,
      name: product.name,
      provider: product.provider,
      category: product.category,
      serviceForm: product.serviceForm,
      effectivePrice: storefrontPriceMap.get(product.id) ?? agentBuyPrice,
    }
  })
}

async function loadResellerBundles(organizationId: string, resellerId: string, parentAgentId: string) {
  const products = await db.product.findMany({
    where: { organizationId, active: true },
    include: {
      agentPrices: {
        where: { agentId: parentAgentId, organizationId },
        select: { price: true },
      },
      resellerPrices: {
        where: { resellerId, organizationId },
        select: { price: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  const [storefrontPrices, pricingProfile] = await Promise.all([
    getResellerStorefrontPrices(resellerId, organizationId),
    getResellerPricingProfileContext(organizationId, resellerId),
  ])
  const storefrontPriceMap = mapStorefrontPrices(storefrontPrices)
  return products.flatMap((product: any) => {
    const parentCost = product.agentPrices?.[0]?.price ?? product.price
    const resellerBuyPrice = resolveResellerBuyPrice({
      overridePrice: product.resellerPrices?.[0]?.price,
      profilePrice: pricingProfile.profilePriceMap.get(product.id),
      parentCost,
      strictPricing: pricingProfile.strictPricing,
    })

    if (resellerBuyPrice === null) return []

    return [{
      id: product.id,
      name: product.name,
      provider: product.provider,
      category: product.category,
      serviceForm: product.serviceForm,
      effectivePrice: storefrontPriceMap.get(product.id) ?? resellerBuyPrice,
    }]
  })
}

async function loadStore(handle: string) {
  const link = await db.storefrontLink.findUnique({
    where: { slug: handle },
    include: {
      organization: {
        include: { subscription: true },
      },
    },
  })

  if (!link?.active || !link.organization) return null

  const organization = link.organization
  const status = await getStoreStatus(organization)
  const ownerType = String(link.ownerType || "SUBSCRIBER").toUpperCase()

  if (ownerType === "AGENT") {
    if (!link.agentId) return null

    const agent = await db.agent.findFirst({
      where: { id: link.agentId, organizationId: organization.id, active: true },
      select: { id: true, name: true },
    })

    if (!agent) return null

    return {
      organization,
      sellerName: agent.name,
      agentId: agent.id,
      resellerId: undefined,
      products: await loadAgentBundles(organization.id, agent.id),
      ...status,
    }
  }

  if (ownerType === "RESELLER") {
    if (!link.resellerId) return null

    const reseller = await db.user.findFirst({
      where: {
        id: link.resellerId,
        organizationId: organization.id,
        role: "RESELLER",
        active: true,
        signupStatus: "APPROVED",
      },
      select: { id: true, name: true, email: true, parentAgentId: true },
    })

    if (!reseller?.parentAgentId) return null

    const parentAgent = await db.agent.findFirst({
      where: { id: reseller.parentAgentId, organizationId: organization.id, active: true },
      select: { id: true },
    })

    if (!parentAgent) return null

    return {
      organization,
      sellerName: reseller.name || reseller.email || "Store",
      agentId: parentAgent.id,
      resellerId: reseller.id,
      products: await loadResellerBundles(organization.id, reseller.id, parentAgent.id),
      ...status,
    }
  }

  return {
    organization,
    sellerName: organization.name,
    agentId: undefined,
    resellerId: undefined,
    products: await loadSubscriberBundles(organization.id),
    ...status,
  }
}

interface ShopPageProps {
  params: {
    handle: string
  }
  searchParams?: {
    checkout?: string
    orders?: string
  }
}

export default async function ShopPage({ params, searchParams }: ShopPageProps) {
  const handle = decodeURIComponent(params.handle || "").trim().toLowerCase()
  if (!handle) return notFound()

  const data = await loadStore(handle)
  if (!data) return notFound()

  const bundles: StoreBundle[] = data.products
    .filter((product: any) => product.category === "DATA_BUNDLE" || !product.category)
    .map((product: any) => ({
      id: product.id,
      name: product.name,
      provider: product.provider,
      category: product.category || "DATA_BUNDLE",
      effectivePrice: product.effectivePrice,
    }))

  const services: StoreBundle[] = data.products
    .filter((product: any) => product.category === "REGISTRATION_SERVICE" || product.category === "AFA_REGISTRATION")
    .map((product: any) => ({
      id: product.id,
      name: product.name,
      provider: product.provider,
      category: product.category,
      serviceForm: product.serviceForm,
      effectivePrice: product.effectivePrice,
    }))

  const checkoutStatus = searchParams?.checkout
  const orderCount = Number(searchParams?.orders || 1)
  const networkCount = new Set(bundles.map((bundle) => String(bundle.provider || "OTHER").toUpperCase())).size
  const catalogCount = bundles.length + services.length
  const returnPath = `/shop/${encodeURIComponent(handle)}`

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      {!data.storeActive && (
        <div className="border-b border-destructive/30 bg-destructive/10 py-4 text-destructive">
          <div className="container flex min-w-0 gap-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Checkout unavailable</p>
              <p>{data.storeInactiveReason || "This store is currently inactive. Purchases are disabled."}</p>
            </div>
          </div>
        </div>
      )}
      {checkoutStatus === "success" ? (
        <div className="border-b border-primary/30 bg-primary/10 py-4 text-primary">
          <div className="container flex min-w-0 gap-3 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Payment successful</p>
              <p>{Number.isFinite(orderCount) && orderCount > 1 ? `${orderCount} orders are` : "Your order is"} now pending fulfillment.</p>
            </div>
          </div>
        </div>
      ) : null}
      {checkoutStatus === "failed" ? (
        <div className="border-b border-destructive/30 bg-destructive/10 py-4 text-destructive">
          <div className="container flex min-w-0 gap-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Payment not completed</p>
              <p>No order has entered fulfillment.</p>
            </div>
          </div>
        </div>
      ) : null}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur-md">
        <div className="container flex min-h-16 min-w-0 items-center justify-between py-3">
          <div className="flex min-w-0 items-center gap-3 font-bold text-xl text-primary">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-sm font-bold text-primary shadow-sm">
              {getInitials(data.sellerName)}
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-base md:text-lg">{data.sellerName}</span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Official customer checkout
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="border-b border-border bg-muted/25 py-8 md:py-14">
        <div className="container space-y-8">
          <div className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-primary">Official storefront</p>
            <h1 className="break-words text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl">
              Buy data and services from {data.sellerName}
            </h1>
            <p className="mt-4 max-w-2xl text-base text-muted-foreground md:text-lg">
              Choose a bundle or registration service, pay securely, and your request goes straight to {data.sellerName} for fulfillment.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="Bundles" value={bundles.length} description="Available public data bundles" icon={Package} tone="primary" />
            <MetricCard label="Services" value={services.length} description="Registration and service requests" icon={FileText} tone="info" />
            <MetricCard label="Payment" value={data.storeActive ? "Ready" : "Paused"} description="Secure checkout confirmation required" icon={data.storeActive ? CreditCard : ShieldCheck} tone={data.storeActive ? "success" : "warning"} />
          </div>
        </div>
      </div>

      <main className="container py-8 md:py-12">
        <SimpleBuySectionsClient
          subscriberSlug={data.organization.slug}
          bundles={bundles}
          services={services}
          agentId={data.agentId}
          resellerId={data.resellerId}
          returnPath={returnPath}
          storeActive={data.storeActive}
          storeInactiveReason={data.storeInactiveReason}
        />
      </main>
      <footer className="border-t border-border py-6">
        <div className="container text-center text-xs text-muted-foreground">
          This storefront is operated by {data.sellerName}. Customer payments are processed securely before fulfillment. {networkCount > 0 ? `${networkCount} network group${networkCount === 1 ? "" : "s"} available.` : catalogCount > 0 ? "Service checkout available." : ""}
        </div>
      </footer>
    </div>
  )
}
