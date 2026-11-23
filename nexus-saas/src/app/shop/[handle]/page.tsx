import { notFound } from "next/navigation"
import { AlertCircle, CheckCircle2 } from "lucide-react"

import { SimpleBuySectionsClient } from "@/components/storefront/simple-buy-sections-client"
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
    ? "This shop is currently inactive. Purchases are disabled."
    : !hasActiveSubscription
      ? "This shop is temporarily unavailable because the business plan is inactive."
      : !hasPaymentSettings
        ? "This shop is not ready for payments yet. The seller needs to connect Paystack."
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
  params: Promise<{
    handle: string
  }>
  searchParams?: Promise<{
    checkout?: string
    orders?: string
  }>
}

export default async function ShopPage(props: ShopPageProps) {
  const searchParams = await props.searchParams;
  const params = await props.params;
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
  const returnPath = `/shop/${encodeURIComponent(handle)}`

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      {!data.storeActive && (
        <div className="border-b border-destructive/30 bg-destructive/10 py-4 text-destructive">
          <div className="container flex min-w-0 gap-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold">Checkout unavailable</p>
              <p className="break-words">{data.storeInactiveReason || "This shop is currently inactive. Purchases are disabled."}</p>
            </div>
          </div>
        </div>
      )}
      {checkoutStatus === "success" ? (
        <div className="border-b border-primary/30 bg-primary/10 py-4 text-primary">
          <div className="container flex min-w-0 gap-3 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold">Payment successful</p>
              <p className="break-words">{Number.isFinite(orderCount) && orderCount > 1 ? `${orderCount} orders are` : "Your order is"} now pending processing.</p>
            </div>
          </div>
        </div>
      ) : null}
      {checkoutStatus === "failed" ? (
        <div className="border-b border-destructive/30 bg-destructive/10 py-4 text-destructive">
          <div className="container flex min-w-0 gap-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold">Payment not completed</p>
              <p className="break-words">No order was created. Please try again or contact the seller if money left your account.</p>
            </div>
          </div>
        </div>
      ) : null}
      <header className="sticky top-0 z-[60] w-full border-b border-border bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="container flex min-h-14 min-w-0 items-center justify-between py-2 sm:min-h-16 sm:py-3">
          <div className="flex min-w-0 items-center gap-2 font-bold text-primary sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-xs font-bold text-primary shadow-sm sm:h-10 sm:w-10 sm:text-sm">
              {getInitials(data.sellerName)}
            </div>
            <div className="flex min-w-0 max-w-[calc(100vw-6rem)] flex-col">
              <span className="truncate text-sm sm:text-base md:text-lg">{data.sellerName}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="border-b border-border bg-muted/25 py-5">
        <div className="container min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Shop</h1>
        </div>
      </div>

      <main className="container min-w-0 py-4 sm:py-6 md:py-8">
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
    </div>
  )
}
