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
    <div className="portal-page flex flex-col gap-6">
      <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold mb-1">Settings</h1>
          <p className="text-muted-foreground max-w-2xl">Control the business setup that powers checkout, API orders, provider dispatch, and storefront access.</p>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Launch Setup"
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

      <Card className="overflow-hidden border border-border bg-card/95 shadow-sm">
        <CardContent className="grid min-w-0 gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Settings map</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Paystack controls customer money, dispatch controls fulfillment routing, and API keys allow trusted external websites to submit paid orders.
            </p>
          </div>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap">
            <span className="rounded-md border bg-background px-3 py-1 text-center text-xs text-muted-foreground">Storefront checkout</span>
            <span className="rounded-md border bg-background px-3 py-1 text-center text-xs text-muted-foreground">API sales</span>
            <span className="rounded-md border bg-background px-3 py-1 text-center text-xs text-muted-foreground">Manual/API dispatch</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid max-w-6xl min-w-0 gap-6">
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
            <h2 className="text-base font-semibold">Business Identity</h2>
            <p className="text-sm text-muted-foreground">This name appears across the dashboard and storefront.</p>
          </div>
          <SettingsForm initialName={user.organization.name} />
        </section>
        <section className="grid gap-3">
          <div>
            <h2 className="text-base font-semibold">Account Verification</h2>
            <p className="text-sm text-muted-foreground">Confirm contact details used for security and account notifications.</p>
          </div>
          <PhoneVerificationCard initialPhoneNumber={user.phoneNumber} verified={Boolean(user.phoneVerified)} />
        </section>
        <section className="grid gap-3">
          <div>
            <h2 className="text-base font-semibold">Subscriber Payments</h2>
            <p className="text-sm text-muted-foreground">Connect the subscriber's own Paystack account so storefront revenue does not pass through the SaaS owner.</p>
          </div>
          <PaymentSettingsCard />
        </section>
        <section className="grid gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <RadioTower className="h-4 w-4 text-primary" />
              Fulfillment Routing
            </h2>
            <p className="text-sm text-muted-foreground">
              Configure this subscriber&apos;s own provider API slots, turn slots on or off, and choose which networks use API routing or manual fulfillment.
            </p>
          </div>
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="space-y-6">
            <ProviderConnectionCard endpoint="/api/dashboard/provider-connection" />
            <DispatchPolicyCard endpoint="/api/dashboard/dispatch-policy" />
          </div>
          <DispatchHealthCard endpoint="/api/dashboard/dispatch-health" />
        </div>
        </section>
        <section className="grid gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Activity className="h-4 w-4 text-primary" />
              External API Access
            </h2>
            <p className="text-sm text-muted-foreground">Create keys for trusted external websites that already collect payment and send orders for fulfillment.</p>
          </div>
          <ApiKeys apiKeys={user.organization.apiKeys} />
        </section>
      </div>
    </div>
  );
}
