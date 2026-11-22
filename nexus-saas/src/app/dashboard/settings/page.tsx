import { auth } from "@/auth";
import { db as prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
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
import { PageHeader } from "@/components/ui/page-header";
import { getStoredOrganizationPaymentSettings } from "@/lib/organization-payment-settings";
import { isSubscriptionActive } from "@/lib/subscription-access";
import { getOrCreateSubscriberStorefrontLink } from "@/lib/storefront-links";
import { Activity, RadioTower } from "lucide-react";

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

  return (
    <div className="portal-page flex min-w-0 flex-col gap-5 overflow-x-hidden sm:gap-6">
      <PageHeader title="Settings" description="Manage your shop, payments, delivery, and API." />

      <nav aria-label="Settings sections" className="flex min-w-0 flex-wrap gap-2 rounded-lg border border-border/70 bg-card p-2">
        {[['business', 'Business'], ['verification', 'Account'], ['payments', 'Payments'], ['delivery', 'Delivery'], ['website-api', 'Website API']].map(([href, label]) => (
          <Link key={href} href={`#${href}`} className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">{label}</Link>
        ))}
      </nav>

      <div className="grid w-full max-w-6xl min-w-0 gap-5 sm:gap-6">
        <StorefrontReadinessCard
          storePath={storePath}
          organizationActive={user.organization.active}
          subscriptionActive={subscriptionActive}
          paystackConnected={paystackConnected}
          productCount={productCount}
          basePriceCount={basePriceCount}
        />
        <div className="grid min-w-0 gap-5 xl:grid-cols-2">
          <section id="business" className="grid scroll-mt-24 gap-3">
            <div>
              <h2 className="break-words text-base font-semibold">Business</h2>
              <p className="break-words text-sm text-muted-foreground">Name shown on your dashboard and shop.</p>
            </div>
            <SettingsForm initialName={user.organization.name} />
          </section>
          <section id="verification" className="grid scroll-mt-24 gap-3">
            <div>
              <h2 className="break-words text-base font-semibold">Account</h2>
              <p className="break-words text-sm text-muted-foreground">Contact details for security and alerts.</p>
            </div>
            <PhoneVerificationCard initialPhoneNumber={user.phoneNumber} verified={Boolean(user.phoneVerified)} />
          </section>
        </div>
        <section id="payments" className="grid scroll-mt-24 gap-3">
          <div>
            <h2 className="break-words text-base font-semibold">Payments</h2>
            <p className="break-words text-sm text-muted-foreground">Customer checkout and seller/owner wallet funding use this Paystack account. Platform subscription billing is separate.</p>
          </div>
          <PaymentSettingsCard />
        </section>
        <section id="delivery" className="grid scroll-mt-24 gap-3">
          <div>
            <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
              <RadioTower className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 break-words">Order Processing</span>
            </h2>
            <p className="break-words text-sm text-muted-foreground">
              Choose automatic or manual order delivery.
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
        <section id="website-api" className="grid scroll-mt-24 gap-3">
          <div>
            <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
              <Activity className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 break-words">Website API</span>
            </h2>
            <p className="break-words text-sm text-muted-foreground">Optional keys for a website that already collects payment.</p>
          </div>
          <ApiKeys apiKeys={user.organization.apiKeys} />
        </section>
      </div>
    </div>
  );
}
