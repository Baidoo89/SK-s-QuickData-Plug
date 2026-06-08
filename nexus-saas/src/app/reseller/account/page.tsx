import { auth } from "@/auth";
import { db } from "@/lib/db";
import { BadgeCheck, ShieldCheck, ShoppingCart, Wallet } from "lucide-react";
import { formatGhanaCedis } from "@/lib/currency";
import { PortalAccessMessage } from "@/components/access/portal-access-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import Link from "next/link";
import { getOrCreateResellerStorefrontLink } from "@/lib/storefront-links";
import { PhoneVerificationCard } from "@/components/auth/phone-verification-card";

export default async function ResellerAccountPage() {
  const session = await auth();
  if (!session?.user?.email) {
    return <PortalAccessMessage title="Login required" description="Sign in with an approved reseller account to manage your profile." />;
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      signupStatus: true,
      phoneNumber: true,
      phoneVerified: true,
      createdAt: true,
      parentAgentId: true,
      organizationId: true,
    },
  });

  if (!user || user.role !== "RESELLER") {
    return <PortalAccessMessage title="Reseller profile unavailable" description="This account is not linked to an approved reseller profile. Ask your agent or subscriber admin to review the account." />;
  }

  const agent = user.parentAgentId
    ? await db.agent.findUnique({
        where: { id: user.parentAgentId },
        include: { organization: true },
      })
    : null;

  const fallbackOrg = user.organizationId
    ? await db.organization.findUnique({ where: { id: user.organizationId } })
    : null;

  const joined = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString()
    : "Unknown";

  const org = agent?.organization ?? fallbackOrg;
  const orgName = org?.name ?? "Not linked";
  const orgSlug = org?.slug ?? null;
  const resellerStorePath = orgSlug && user.organizationId && user.parentAgentId
    ? await getOrCreateResellerStorefrontLink({
        organizationId: user.organizationId,
        organizationSlug: orgSlug,
        resellerId: user.id,
        resellerName: user.name || user.email || "Store",
      })
    : null;
  const [walletAgg, orderCount, completedOrderCount] = await Promise.all([
    db.walletTransaction.aggregate({
      _sum: { amount: true },
      where: { userId: user.id, status: "success" },
    }),
    db.order.count({
      where: { organizationId: user.organizationId ?? undefined, userId: user.id },
    }),
    db.order.count({
      where: { organizationId: user.organizationId ?? undefined, userId: user.id, status: "COMPLETED" },
    }),
  ]);
  const walletBalance = walletAgg._sum.amount ?? 0;
  const isActive = user.active && user.signupStatus === "APPROVED";

  return (
    <div className="portal-page space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Account</h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Your reseller profile, linked agent, storefront access, and wallet context.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/reset">Change password</Link>
        </Button>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Wallet Balance" value={formatGhanaCedis(walletBalance)} description="Successful wallet transactions" icon={Wallet} tone="success" />
        <MetricCard label="Orders" value={orderCount} description={`${completedOrderCount} completed orders`} icon={ShoppingCart} tone="info" />
        <MetricCard label="Access" value={isActive ? "Active" : "Restricted"} description={`Signup status: ${user.signupStatus}`} icon={ShieldCheck} tone={isActive ? "success" : "warning"} />
        <MetricCard label="Parent Agent" value={agent ? "Linked" : "Missing"} description={agent?.name ?? "Ask admin to link this account"} icon={BadgeCheck} tone={agent ? "primary" : "warning"} />
      </div>

      <PhoneVerificationCard initialPhoneNumber={user.phoneNumber} verified={Boolean(user.phoneVerified)} />

      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <Card className="premium-surface border-0">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Profile</CardTitle>
            <CardDescription className="text-xs">Basic information about your reseller account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{user.name || "Unnamed reseller"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Email</span>
              <span className="break-all text-right font-medium">{user.email}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Status</span>
              <Badge variant={isActive ? "secondary" : "outline"} className={isActive ? "status-success border" : "status-warning border"}>
                {isActive ? "Active" : user.signupStatus}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Joined</span>
              <span className="font-medium">{joined}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="premium-surface border-0">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Linked Agent & Organization</CardTitle>
            <CardDescription className="text-xs">Where your reseller sales are routed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Parent agent</span>
              <span className="font-medium">{agent ? agent.name : "Not linked"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Organization</span>
              <span className="font-medium">{orgName}</span>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground">Recommended storefront</span>
              <p className="break-all font-mono text-xs">{resellerStorePath ?? "Not available yet"}</p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/reseller/storefronts">View storefront tools</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
