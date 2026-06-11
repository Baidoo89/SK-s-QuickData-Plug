import { auth } from "@/auth";
import { db as prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { SettingsForm } from "@/components/dashboard/settings-form";
import { ApiKeys } from "@/components/dashboard/api-keys";
import { PaymentSettingsCard } from "@/components/dashboard/payment-settings-card";
import { StorefrontReadinessCard } from "@/components/dashboard/storefront-readiness-card";
import { PortalAccessMessage } from "@/components/access/portal-access-message";
import { ProviderConnectionCard } from "@/components/admin/provider-connection-card";
import { DispatchPolicyCard } from "@/components/admin/dispatch-policy-card";
import { DispatchHealthCard } from "@/components/admin/dispatch-health-card";
import { ProviderProductMappingCard } from "@/components/dashboard/provider-product-mapping-card";
import { PhoneVerificationCard } from "@/components/auth/phone-verification-card";
import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardContent } from "@/components/ui/card";
import { getStoredOrganizationPaymentSettings } from "@/lib/organization-payment-settings";
import { isSubscriptionActive } from "@/lib/subscription-access";
import { getOrCreateSubscriberStorefrontLink } from "@/lib/storefront-links";
import { Activity, CheckCircle2, CreditCard, KeyRound, Package, RadioTower } from "lucide-react";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { 
      organization: {
        include: {
          subscription: true,
          apiKeys: {
            orderBy: { createdAt: 'desc' }
          }
        }
      } 
    },
  });

  if (!user?.organization) {
    return <PortalAccessMessage title="Organization unavailable" description="This subscriber account is not linked to an organization yet. Ask the platform owner to review the account setup." />;
  }

  const [productCount, basePriceCount, paymentSettings] = await Promise.all([
    prisma.product.count({
      where: { organizationId: user.organization.id, active: true },
    }),
    prisma.basePrice.count({
      where: { organizationId: user.organization.id },
    }),
    getStoredOrganizationPaymentSettings(user.organization.id),
  ]);

  const storePath = user.organization.slug
    ? await getOrCreateSubscriberStorefrontLink({
        organizationId: user.organization.id,
        organizationName: user.organization.name,
        organizationSlug: user.organization.slug,
      })
    : null;
  const subscriptionActive = isSubscriptionActive(user.organization.subscription);
  const paystackConnected = Boolean(paymentSettings?.paystackConnected);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const apiKeyCount = user.organization.apiKeys.length;
  const activeApiKeys24h = user.organization.apiKeys.filter((key) => key.lastUsed && key.lastUsed >= dayAgo).length;
  const setupReadyCount = [
    user.organization.active,
    subscriptionActive,
    paystackConnected,
    productCount > 0,
    basePriceCount > 0,
  ].filter(Boolean).length;

  return (
    <div className="portal-page flex min-w-0 flex-col gap-5 overflow-x-hidden sm:gap-6">
      <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="mb-1 break-words text-2xl font-bold md:text-3xl">Settings</h1>
          <p className="max-w-2xl break-words text-sm text-muted-foreground sm:text-base">Control the business setup that powers customer checkout, website orders, automatic delivery, and shop links.</p>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Setup Guide"
          value={`${setupReadyCount}/5`}
          description="Store, billing, Paystack, products, pricing"
          icon={CheckCircle2}
          tone={setupReadyCount === 5 ? "success" : "warning"}
        />
        <MetricCard
          label="Paystack"
          value={paystackConnected ? "Connected" : "Required"}
          description="Customer payments settle to subscriber account"
          icon={CreditCard}
          tone={paystackConnected ? "success" : "warning"}
        />
        <MetricCard
          label="Products"
          value={productCount}
          description={`${basePriceCount} pricing record${basePriceCount === 1 ? "" : "s"}`}
          icon={Package}
          tone={productCount > 0 && basePriceCount > 0 ? "success" : "warning"}
        />
        <MetricCard
          label="API Keys"
          value={apiKeyCount}
          description={`${activeApiKeys24h} active in last 24h`}
          icon={KeyRound}
          tone={apiKeyCount > 0 ? "primary" : "muted"}
        />
      </div>

      <Card className="premium-surface min-w-0 overflow-hidden rounded-lg">
        <CardContent className="grid min-w-0 gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">How settings work together</p>
            <p className="mt-1 break-words text-xs text-muted-foreground">
              Paystack handles customer money, automatic delivery handles API processing, and Website API keys let trusted websites send paid orders.
            </p>
          </div>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap">
            <span className="min-w-0 break-words rounded-md border border-border/70 bg-background/80 px-3 py-1 text-center text-xs text-muted-foreground shadow-sm">Shop checkout</span>
            <span className="min-w-0 break-words rounded-md border border-border/70 bg-background/80 px-3 py-1 text-center text-xs text-muted-foreground shadow-sm">Website sales</span>
            <span className="min-w-0 break-words rounded-md border border-border/70 bg-background/80 px-3 py-1 text-center text-xs text-muted-foreground shadow-sm">Order processing</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid w-full max-w-6xl min-w-0 gap-5 sm:gap-6">
        <StorefrontReadinessCard
          storePath={storePath}
          organizationActive={user.organization.active}
          subscriptionActive={subscriptionActive}
          paystackConnected={paystackConnected}
          productCount={productCount}
          basePriceCount={basePriceCount}
        />
        <section className="grid gap-3">
          <div>
            <h2 className="break-words text-base font-semibold">Business Name</h2>
            <p className="break-words text-sm text-muted-foreground">This name appears across the dashboard and shop pages.</p>
          </div>
          <SettingsForm initialName={user.organization.name} />
        </section>
        <section className="grid gap-3">
          <div>
            <h2 className="break-words text-base font-semibold">Account Verification</h2>
            <p className="break-words text-sm text-muted-foreground">Confirm contact details used for security and account notifications.</p>
          </div>
          <PhoneVerificationCard initialPhoneNumber={user.phoneNumber} verified={Boolean(user.phoneVerified)} />
        </section>
        <section className="grid gap-3">
          <div>
            <h2 className="break-words text-base font-semibold">Customer Payments</h2>
            <p className="break-words text-sm text-muted-foreground">Connect your own Paystack account so customer money goes directly to your business.</p>
          </div>
          <PaymentSettingsCard />
        </section>
        <section className="grid gap-3">
          <div>
            <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
              <RadioTower className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 break-words">Order Processing</span>
            </h2>
            <p className="break-words text-sm text-muted-foreground">
              Connect delivery APIs, turn options on or off, and choose which networks are automatic or manual.
            </p>
          </div>
          <div className="grid min-w-0 gap-5 sm:gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <div className="min-w-0 space-y-5 sm:space-y-6">
              <ProviderConnectionCard endpoint="/api/dashboard/provider-connection" />
              <DispatchPolicyCard endpoint="/api/dashboard/dispatch-policy" />
              <ProviderProductMappingCard />
            </div>
            <div className="min-w-0">
              <DispatchHealthCard endpoint="/api/dashboard/dispatch-health" />
            </div>
          </div>
        </section>
        <section className="grid gap-3">
          <div>
            <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
              <Activity className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 break-words">Website API</span>
            </h2>
            <p className="break-words text-sm text-muted-foreground">Create keys for trusted websites that already collect payment and send orders to TechDalt.</p>
          </div>
          <ApiKeys apiKeys={user.organization.apiKeys} />
        </section>
      </div>
    </div>
  );
}
