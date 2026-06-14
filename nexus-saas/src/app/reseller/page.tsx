import { auth } from "@/auth";
import { db } from "@/lib/db";
import { formatGhanaCedis } from "@/lib/currency";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileText, Megaphone, ShoppingBag, ShoppingCart, Store, TrendingUp, Wallet } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { PortalAccessMessage } from "@/components/access/portal-access-message";
import { Badge } from "@/components/ui/badge";
import { getUserWithdrawableSummary } from "@/lib/withdrawal-balance";
import { getOrCreateResellerStorefrontLink } from "@/lib/storefront-links";

function getGreetingByTime(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getDisplayName(name: string | null | undefined, email: string | null | undefined): string {
  const trimmedName = name?.trim();
  if (trimmedName) return trimmedName;
  const emailPrefix = email?.split("@")[0]?.trim();
  return emailPrefix || "there";
}

type SalesRangeKey = "daily" | "weekly" | "monthly";

type ChannelMetric = {
  key: string;
  label: string;
  count: number;
  revenue: number;
  profit: number;
  pending: number;
  href: string;
}

type AlertItem = {
  label: string;
  description: string;
  href: string;
  action: string;
  tone: "warning" | "info";
}

function resolveSalesRange(input?: string): SalesRangeKey {
  if (input === "weekly" || input === "monthly") return input;
  return "daily";
}

function getRangeStart(now: Date, range: SalesRangeKey): Date {
  if (range === "monthly") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (range === "weekly") return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function getRangeLabel(range: SalesRangeKey): string {
  if (range === "weekly") return "Last 7 days";
  if (range === "monthly") return "This month";
  return "Today";
}

export default async function ResellerDashboardPage({ searchParams }: { searchParams?: { salesRange?: string } }) {
  const session = await auth();
  if (!session?.user?.email) {
    return <PortalAccessMessage title="Login required" description="Sign in with an approved reseller account to access this workspace." />;
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      organizationId: true,
      parentAgentId: true,
      organization: { select: { slug: true, name: true } },
    },
  });

  if (!user || user.role !== "RESELLER" || !user.organizationId || !user.parentAgentId) {
    return <PortalAccessMessage title="Reseller profile unavailable" description="This account is not linked to an approved reseller profile. Ask your agent to review the account." />;
  }

  const now = new Date();
  const selectedSalesRange = resolveSalesRange(searchParams?.salesRange);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = now.getDay();
  const diffToMonday = (day + 6) % 7;
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - diffToMonday);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const salesStart = getRangeStart(now, selectedSalesRange);

  const [
    walletAgg,
    todaysOrders,
    completedOrders,
    selectedRangeOrders,
    withdrawalSummary,
    storefrontPriceCount,
    pendingWithdrawals,
    manualWorkCount,
    todayServiceRequests,
    pendingServiceRequestCount,
  ] = await Promise.all([
    db.walletTransaction.aggregate({
      _sum: { amount: true },
      where: { userId: user.id, status: "success" },
    }),
    db.order.findMany({
      where: {
        organizationId: user.organizationId,
        userId: user.id,
        createdAt: { gte: startOfToday },
      },
      include: { items: true },
    }),
    db.order.findMany({
      where: {
        organizationId: user.organizationId,
        userId: user.id,
        status: "COMPLETED",
        createdAt: { gte: startOfMonth },
      },
      include: { items: true },
    }),
    db.order.findMany({
      where: {
        organizationId: user.organizationId,
        userId: user.id,
        status: "COMPLETED",
        createdAt: { gte: salesStart },
      },
      include: { items: true },
    }),
    getUserWithdrawableSummary(user.id),
    db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "ResellerStorefrontPrice"
      WHERE "resellerId" = ${user.id}
        AND "organizationId" = ${user.organizationId}
    `,
    db.withdrawalRequest.count({
      where: {
        organizationId: user.organizationId,
        userId: user.id,
        status: { in: ["PENDING", "APPROVED"] },
      },
    }),
    db.order.count({
      where: {
        organizationId: user.organizationId,
        userId: user.id,
        status: { in: ["PENDING", "PROCESSING"] },
        paymentStatus: "PAID",
        fulfillmentMode: "MANUAL",
      },
    }),
    db.serviceRequest.findMany({
      where: {
        organizationId: user.organizationId,
        OR: [{ sellerUserId: user.id }, { userId: user.id }],
        createdAt: { gte: startOfToday },
      },
      select: { total: true, profit: true },
    }),
    db.serviceRequest.count({
      where: {
        organizationId: user.organizationId,
        OR: [{ sellerUserId: user.id }, { userId: user.id }],
        status: "PENDING_REVIEW",
        paymentStatus: "PAID",
      },
    }),
  ]);

  const walletBalance = walletAgg._sum.amount ?? 0;
  const todayCompletedOrders = todaysOrders.filter((order) => order.status === "COMPLETED");
  const todayBuys = todaysOrders.filter((order) => order.source === "DASHBOARD_BUY");
  const todayStorefrontSales = todaysOrders.filter((order) => order.source === "STOREFRONT");
  const dailySales = todayCompletedOrders.reduce((sum, order) => sum + order.total, 0);
  const weeklySales = completedOrders
    .filter((order) => order.createdAt >= startOfWeek)
    .reduce((sum, order) => sum + order.total, 0);
  const monthCompletedTotal = completedOrders.reduce((sum, order) => sum + order.total, 0);
  const filteredSales = selectedRangeOrders.reduce((sum, order) => sum + order.total, 0);
  const dailyProfit = todayCompletedOrders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.profit, 0), 0);
  const weeklyProfit = completedOrders
    .filter((order) => order.createdAt >= startOfWeek)
    .reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.profit, 0), 0);
  const monthProfit = completedOrders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.profit, 0), 0);
  const selectedSalesRangeLabel = getRangeLabel(selectedSalesRange);
  const serviceRevenueToday = todayServiceRequests.reduce((sum, request) => sum + request.total, 0);
  const serviceProfitToday = todayServiceRequests.reduce((sum, request) => sum + request.profit, 0);
  const greeting = getGreetingByTime(now);
  const displayName = getDisplayName(user.name, user.email);
  const storefrontPriceTotal = Number(storefrontPriceCount[0]?.count ?? 0);
  const resellerStorePath = user.organization?.slug
    ? await getOrCreateResellerStorefrontLink({
        organizationId: user.organizationId,
        organizationSlug: user.organization.slug,
        resellerId: user.id,
        resellerName: displayName,
      })
    : null;

  function summarize(orders: typeof todaysOrders) {
    return {
      count: orders.length,
      revenue: orders.reduce((sum, order) => sum + order.total, 0),
      profit: orders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.profit, 0), 0),
      pending: orders.filter((order) => ["PENDING", "PROCESSING", "PENDING_PAYMENT"].includes(order.status)).length,
    };
  }

  const channelMetrics: ChannelMetric[] = [
    { key: "buys", label: "My buys", ...summarize(todayBuys), href: "/reseller/orders" },
    { key: "storefront", label: "Shop sales", ...summarize(todayStorefrontSales), href: "/reseller/orders" },
    { key: "services", label: "Services", count: todayServiceRequests.length, revenue: serviceRevenueToday, profit: serviceProfitToday, pending: pendingServiceRequestCount, href: "/reseller/service-requests" },
    { key: "manual", label: "In progress", count: manualWorkCount, revenue: todaysOrders.filter((order) => ["PENDING", "PROCESSING"].includes(order.status)).reduce((sum, order) => sum + order.total, 0), profit: 0, pending: manualWorkCount, href: "/reseller/orders" },
  ];

  const alertItems: AlertItem[] = [
    ...(walletBalance <= 0 ? [{
      label: "Wallet needs funding",
      description: "Top up before buying data.",
      href: "/reseller/wallet",
      action: "Open wallet",
      tone: "warning" as const,
    }] : []),
    ...(storefrontPriceTotal === 0 ? [{
      label: "No customer prices",
      description: "Set prices before sharing your shop.",
      href: "/reseller/storefront-pricing",
      action: "Set prices",
      tone: "warning" as const,
    }] : []),
    ...(pendingWithdrawals > 0 ? [{
      label: "Withdrawal in review",
      description: `${pendingWithdrawals} payout${pendingWithdrawals === 1 ? "" : "s"} waiting.`,
      href: "/reseller/withdrawals",
      action: "View withdrawals",
      tone: "info" as const,
    }] : []),
    ...(manualWorkCount > 0 ? [{
      label: "Orders in progress",
      description: `${manualWorkCount} order${manualWorkCount === 1 ? "" : "s"} waiting.`,
      href: "/reseller/orders",
      action: "View orders",
      tone: "info" as const,
    }] : []),
    ...(pendingServiceRequestCount > 0 ? [{
      label: "Service requests",
      description: `${pendingServiceRequestCount} waiting.`,
      href: "/reseller/service-requests?status=PENDING_REVIEW",
      action: "View services",
      tone: "info" as const,
    }] : []),
    ...(!resellerStorePath ? [{
      label: "Shop link unavailable",
      description: "Ask your agent to review your account.",
      href: "/reseller/account",
      action: "Review account",
      tone: "warning" as const,
    }] : []),
  ];

  return (
    <div className="portal-page space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">{`${greeting}, ${displayName}.`}</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground max-w-xl">
          Buy data, track sales, and withdraw profit.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          {([
            { key: "daily", label: "Daily" },
            { key: "weekly", label: "Weekly" },
            { key: "monthly", label: "Monthly" },
          ] as const).map((item) => {
            const active = selectedSalesRange === item.key;
            const href = item.key === "daily" ? "/reseller" : `/reseller?salesRange=${item.key}`;
            return (
              <Link
                key={item.key}
                href={href}
                className={[
                  "rounded-full border px-3 py-1 text-xs font-semibold transition",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
          <Button asChild size="sm" variant="outline" className="h-7 text-[11px]">
            <Link href={selectedSalesRange === "daily" ? "/api/reseller/analytics/export" : `/api/reseller/analytics/export?salesRange=${selectedSalesRange}`}>
              Export CSV
            </Link>
          </Button>
        </div>
      </div>

      {alertItems.length > 0 ? (
        <Card className="premium-surface overflow-hidden rounded-lg">
          <CardHeader className="border-b bg-muted/30 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-primary" />
              Needs attention
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {alertItems.map((item) => (
              <div key={item.label} className={item.tone === "warning" ? "status-warning rounded-md border p-3" : "status-info rounded-md border p-3"}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p className="mt-1 text-xs leading-5">{item.description}</p>
                  </div>
                  <Button asChild size="sm" variant="outline" className="shrink-0 bg-background text-xs">
                    <Link href={item.href}>{item.action}</Link>
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <div className="status-success flex gap-3 rounded-md border px-4 py-3 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Everything looks good</p>
            <p>No urgent alerts.</p>
          </div>
        </div>
      )}

      <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-6">
        <MetricCard
          label="My Buys"
          value={todayBuys.length}
          description={`${todaysOrders.length} total today`}
          icon={ShoppingCart}
          tone="info"
        />
        <MetricCard
          label="Wallet"
          value={formatGhanaCedis(walletBalance)}
          description="Available for data buys"
          icon={Wallet}
          tone="success"
        />
        <MetricCard
          label="Shop Sales"
          value={todayStorefrontSales.length}
          description={formatGhanaCedis(todayStorefrontSales.reduce((sum, order) => sum + order.total, 0))}
          icon={Store}
          tone="primary"
        />
        <MetricCard
          label="Withdrawable"
          value={formatGhanaCedis(withdrawalSummary.availableBalance)}
          description={`${formatGhanaCedis(withdrawalSummary.lockedAmount)} locked, ${formatGhanaCedis(withdrawalSummary.paidOut)} paid`}
          icon={TrendingUp}
          tone="success"
        />
        <MetricCard
          label="Services"
          value={pendingServiceRequestCount}
          description={`${todayServiceRequests.length} today`}
          icon={FileText}
          tone={pendingServiceRequestCount > 0 ? "warning" : "primary"}
        />
        <Card className="md:col-span-2 lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Revenue snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Today</span>
              <span className="font-semibold">{formatGhanaCedis(dailySales)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">This week</span>
              <span className="font-semibold">{formatGhanaCedis(weeklySales)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">This month</span>
              <span className="font-semibold">{formatGhanaCedis(monthCompletedTotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Selected range ({selectedSalesRangeLabel})</span>
              <span className="font-semibold">{formatGhanaCedis(filteredSales)}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="md:col-span-2 lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Profit snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Today</span>
              <span className="font-semibold">{formatGhanaCedis(dailyProfit)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">This week</span>
              <span className="font-semibold">{formatGhanaCedis(weeklyProfit)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">This month</span>
              <span className="font-semibold">{formatGhanaCedis(monthProfit)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="premium-surface border-0">
        <CardHeader className="border-b bg-muted/30 pb-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">Today's Sales</CardTitle>
            </div>
            <Badge variant="outline" className="w-fit">{manualWorkCount} manual</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          {channelMetrics.map((channel) => (
            <Link key={channel.key} href={channel.href} className="rounded-lg border border-border/70 bg-background/80 p-3 shadow-sm transition-colors hover:bg-muted/40">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{channel.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{channel.count} order{channel.count === 1 ? "" : "s"}</p>
                </div>
                {channel.pending > 0 ? <Badge variant="secondary">{channel.pending} pending</Badge> : <Badge variant="outline">Clear</Badge>}
              </div>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Revenue</span>
                  <span className="font-semibold text-foreground">{formatGhanaCedis(channel.revenue)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Profit</span>
                  <span className={channel.profit > 0 ? "font-semibold text-primary" : "font-medium text-muted-foreground"}>{formatGhanaCedis(channel.profit)}</span>
                </div>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card className="premium-surface border-0">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Quick actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {[
              { href: "/reseller/buy/single", label: "Buy single", description: "Send one bundle.", icon: ShoppingBag },
              { href: "/reseller/buy/bulk", label: "Buy bulk", description: "Upload many numbers.", icon: ShoppingBag },
              { href: "/reseller/storefront-pricing", label: "Prices", description: "Set shop margins.", icon: Megaphone },
              { href: "/reseller/orders", label: "Orders", description: "Review order status.", icon: FileText },
              { href: "/reseller/service-requests", label: "Service requests", description: "Track registration sales.", icon: FileText },
              { href: "/reseller/wallet", label: "Wallet", description: "Top up and inspect logs.", icon: Wallet },
            ].map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.href} href={action.href} className="group">
                  <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-background/80 px-3 py-2 shadow-sm transition-colors group-hover:border-primary">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">{action.label}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{action.description}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {resellerStorePath ? (
        <Card className="premium-surface border-0">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Your shop link</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 truncate rounded-lg border border-border/70 bg-background/80 px-3 py-2 font-mono text-xs shadow-sm">{resellerStorePath}</p>
            <Button asChild size="sm" variant="outline" className="text-xs">
              <Link href="/reseller/storefronts">Share links</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
