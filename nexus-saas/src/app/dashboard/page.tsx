import Link from "next/link";
import type { ComponentType } from "react";
import { ExternalLink, Activity, AlertTriangle, CheckCircle2, CreditCard, Package, Settings, TrendingUp, Users, WalletCards, Wrench } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { Overview } from "@/components/overview";
import { RecentSales } from "@/components/recent-sales";
import { SellingAccessAlert } from "@/components/access/selling-access-alert";
import { formatGhanaCedis } from "@/lib/currency";
import { getStoredOrganizationPaymentSettings } from "@/lib/organization-payment-settings";
import { isSubscriptionActive } from "@/lib/subscription-access";
import { getOrganizationSellingAccess, type SellingAccessStatus } from "@/lib/selling-access";
import { getDispatchMetaByOrderIds } from "@/lib/admin-order-dispatch";
import { getEffectiveProviderConnection } from "@/lib/provider-connection";
import { getOrCreateSubscriberStorefrontLink } from "@/lib/storefront-links";
import { minorToMoney } from "@/lib/money";
import { CreditStatusCard } from "@/components/wallet/credit-status-card";

type OnboardingItem = {
  label: string;
  description: string;
  href: string;
  complete: boolean;
  required?: boolean;
  icon: ComponentType<{ className?: string }>;
}

type ChannelMetric = {
  key: string;
  label: string;
  count: number;
  revenue: number;
  profit: number;
  href: string;
}

type AlertItem = {
  label: string;
  description: string;
  href: string;
  action: string;
  tone: "warning" | "info";
}

export default async function DashboardPage() {
  const session = await auth();
  
  let storeUrl = "#";
  let revenueToday = 0;
  let profitToday = 0;
  let ordersToday = 0;
  let pendingManualOrders = 0;
  let processingManualOrders = 0;
  let pendingServiceRequests = 0;
  let providerConnected = false;
  let walletBalance = 0;
  let creditEnabled = false;
  let creditLimit = 0;
  let creditDueAt: Date | null = null;
  let creditOwed = 0;
  let creditOverdue = false;
  let recentSales: any[] = [];
  let monthlySalesData: any[] = [];
  let onboardingItems: OnboardingItem[] = [];
  let channelMetrics: ChannelMetric[] = [];
  let alertItems: AlertItem[] = [];
  let onboardingCompleteCount = 0;
  let onboardingIsReady = false;
  let sellingAccess: SellingAccessStatus | null = null;
  try {
    if (session?.user?.email) {
      const user = await db.user.findUnique({
        where: { email: session.user.email },
        include: {
          organization: {
            include: {
              subscription: true,
            },
          },
        },
      });
      
      if (user?.organization?.slug) {
        storeUrl = await getOrCreateSubscriberStorefrontLink({
          organizationId: user.organization.id,
          organizationName: user.organization.name,
          organizationSlug: user.organization.slug,
        });
      }

      if (user?.organizationId) {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const [apiKeyCount, todayProfitAgg, productCount, basePriceCount, agentCount, paymentSettings, providerConnection, manualCandidates, todayOrders, walletAgg, pendingServiceCount] = await Promise.all([
          db.apiKey.count({
            where: { organizationId: user.organizationId },
          }),
          db.orderItem.aggregate({
            _sum: { profit: true },
            where: {
              order: {
                organizationId: user.organizationId,
                status: "COMPLETED",
                createdAt: { gte: startOfToday },
              },
            },
          }),
          db.product.count({
            where: { organizationId: user.organizationId, active: true },
          }),
          db.basePrice.count({
            where: { organizationId: user.organizationId },
          }),
          db.agent.count({
            where: { organizationId: user.organizationId, active: true },
          }),
          getStoredOrganizationPaymentSettings(user.organizationId),
          getEffectiveProviderConnection(user.organizationId),
          db.order.findMany({
            where: {
              organizationId: user.organizationId,
              status: { in: ["PENDING", "PROCESSING"] },
              paymentStatus: "PAID",
              fulfillmentMode: "MANUAL",
            },
            select: { id: true, status: true },
            orderBy: { createdAt: "desc" },
            take: 500,
          }),
          db.order.findMany({
            where: {
              organizationId: user.organizationId,
              createdAt: { gte: startOfToday },
            },
            include: { items: true },
          }),
          db.walletTransaction.aggregate({
            _sum: { amount: true },
            where: { userId: user.id, status: "success" },
          }),
          db.serviceRequest.count({
            where: {
              organizationId: user.organizationId,
              status: "PENDING_REVIEW",
              paymentStatus: "PAID",
            },
          }),
        ]);

        const subscriptionActive = isSubscriptionActive(user.organization?.subscription);
        const paystackConnected = Boolean(paymentSettings?.paystackConnected);
        providerConnected = Boolean(providerConnection.providerOrderUrl);
        const productsReady = productCount > 0;
        const pricingReady = basePriceCount > 0;
        const apiReady = apiKeyCount > 0;
        const agentsReady = agentCount > 0;
        const storefrontReady = Boolean(user.organization?.slug && subscriptionActive && paystackConnected && productsReady && pricingReady);
        sellingAccess = await getOrganizationSellingAccess(user.organizationId);

        onboardingItems = [
          {
            label: "Subscription active",
            description: subscriptionActive ? "Selling is active." : "Choose or activate a plan.",
            href: "/dashboard/subscription",
            complete: subscriptionActive,
            icon: CreditCard,
          },
          {
            label: "Payment ready",
            description: paystackConnected ? "Paystack is connected." : "Connect Paystack.",
            href: "/dashboard/settings",
            complete: paystackConnected,
            icon: WalletCards,
          },
          {
            label: "Products",
            description: productsReady ? `${productCount} active.` : "Add bundles or services.",
            href: "/dashboard/products",
            complete: productsReady,
            icon: Package,
          },
          {
            label: "Prices set",
            description: pricingReady ? `${basePriceCount} set.` : "Set customer prices.",
            href: "/dashboard/products",
            complete: pricingReady,
            icon: Settings,
          },
          {
            label: "Shop ready",
            description: storefrontReady ? "Ready to share." : "Finish setup first.",
            href: storeUrl !== "#" ? storeUrl : "/dashboard/settings",
            complete: storefrontReady,
            icon: ExternalLink,
          },
          {
            label: "Team sellers",
            description: agentsReady ? `${agentCount} active.` : "Add agents when ready.",
            href: "/dashboard/agents",
            complete: agentsReady,
            required: false,
            icon: Users,
          },
          {
            label: "Website API",
            description: apiReady ? `${apiKeyCount} key${apiKeyCount === 1 ? "" : "s"}.` : "Optional.",
            href: "/dashboard/settings",
            complete: apiReady,
            required: false,
            icon: Activity,
          },
        ];
        onboardingCompleteCount = onboardingItems.filter((item) => item.required !== false && item.complete).length;
        onboardingIsReady = storefrontReady;

        profitToday = todayProfitAgg._sum.profit ?? 0;
        walletBalance = walletAgg._sum.amount ?? 0;
        pendingServiceRequests = pendingServiceCount;

        const creditAccount = await db.creditAccount.findUnique({
          where: { userId: user.id },
          select: { enabled: true, limitMinor: true, dueAt: true },
        });
        creditEnabled = creditAccount?.enabled ?? false;
        creditLimit = creditAccount ? minorToMoney(Number(creditAccount.limitMinor)) : 0;
        creditDueAt = creditAccount?.dueAt ?? null;
        creditOwed = Math.max(-walletBalance, 0);
        creditOverdue = creditOwed > 0 && Boolean(creditDueAt && creditDueAt <= now);

        const manualDispatchMap = await getDispatchMetaByOrderIds(manualCandidates.map((order) => order.id));
        const manualRows = manualCandidates.filter((order) => (manualDispatchMap.get(order.id)?.mode || "MANUAL") === "MANUAL");
        pendingManualOrders = manualRows.filter((order) => order.status === "PENDING").length;
        processingManualOrders = manualRows.filter((order) => order.status === "PROCESSING").length;

        const summarizeOrders = (orders: typeof todayOrders) => ({
          count: orders.length,
          revenue: orders.reduce((sum, order) => sum + order.total, 0),
          profit: orders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.profit, 0), 0),
        });

        const todayApiOrders = todayOrders.filter((order) => order.source === "API");
        const todayStorefrontOrders = todayOrders.filter((order) => order.source === "STOREFRONT");
        const todayDashboardBuys = todayOrders.filter((order) => order.source === "DASHBOARD_BUY");
        const todayAgentOrders = todayOrders.filter((order) => order.sellerRole === "AGENT");
        const todayResellerOrders = todayOrders.filter((order) => order.sellerRole === "RESELLER");
        const apiSummary = summarizeOrders(todayApiOrders);
        const storefrontSummary = summarizeOrders(todayStorefrontOrders);
        const dashboardBuySummary = summarizeOrders(todayDashboardBuys);
        const agentSummary = summarizeOrders(todayAgentOrders);
        const resellerSummary = summarizeOrders(todayResellerOrders);

        channelMetrics = [
          { key: "api", label: "Website sales", ...apiSummary, href: "/dashboard/orders?source=API" },
          { key: "storefront", label: "Shop link sales", ...storefrontSummary, href: "/dashboard/orders?source=STOREFRONT" },
          { key: "dashboard", label: "Direct buys", ...dashboardBuySummary, href: "/dashboard/orders?source=DASHBOARD" },
          { key: "agent", label: "Agent activity", ...agentSummary, href: "/dashboard/orders?source=AGENT" },
          { key: "reseller", label: "Reseller activity", ...resellerSummary, href: "/dashboard/orders?source=RESELLER" },
        ];

        alertItems = [
          ...(creditOverdue ? [{
            label: "Credit is overdue",
            description: "Repay before borrowing again.",
            href: "/dashboard/credit",
            action: "View debt",
            tone: "warning" as const,
          }] : creditOwed > 0 ? [{
            label: "Credit due",
            description: `${formatGhanaCedis(creditOwed)} outstanding.`,
            href: "/dashboard/credit",
            action: "View debt",
            tone: "info" as const,
          }] : []),
          ...(!subscriptionActive ? [{
            label: "Plan inactive",
            description: "Activate your plan to sell.",
            href: "/dashboard/subscription",
            action: "Manage subscription",
            tone: "warning" as const,
          }] : []),
          ...(!paystackConnected ? [{
            label: "Payments offline",
            description: "Connect Paystack to accept payments.",
            href: "/dashboard/settings",
            action: "Connect Paystack",
            tone: "warning" as const,
          }] : []),
          ...(!providerConnected ? [{
            label: "Delivery offline",
            description: "Orders can be processed manually.",
            href: "/dashboard/settings",
            action: "Review delivery",
            tone: "info" as const,
          }] : []),
          ...(pendingManualOrders > 0 ? [{
            label: "Orders need processing",
            description: `${pendingManualOrders} order${pendingManualOrders === 1 ? "" : "s"} waiting.`,
            href: "/dashboard/orders",
            action: "Open orders",
            tone: "warning" as const,
          }] : []),
          ...(pendingServiceRequests > 0 ? [{
            label: "Services waiting",
            description: `${pendingServiceRequests} request${pendingServiceRequests === 1 ? "" : "s"} waiting.`,
            href: "/dashboard/service-requests?status=PENDING_REVIEW",
            action: "Review services",
            tone: "warning" as const,
          }] : []),
          ...(!productsReady ? [{
            label: "No active products",
            description: "Add products before sharing.",
            href: "/dashboard/products",
            action: "Add products",
            tone: "warning" as const,
          }] : []),
        ];

        // Fetch completed orders for the revenue chart and today's revenue KPI.
        const completedOrdersData = await db.order.findMany({
          where: {
            organizationId: user.organizationId,
            status: "COMPLETED",
          },
          select: { total: true, createdAt: true },
        });

        // Initialize monthly data for the chart.
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const currentYear = now.getFullYear();
        const monthlyData = months.map(month => ({ name: month, total: 0 }));

        completedOrdersData.forEach((order) => {
          const date = new Date(order.createdAt);

          if (date >= startOfToday) {
            revenueToday += order.total;
          }

          if (date.getFullYear() === currentYear) {
            const monthIndex = date.getMonth();
            monthlyData[monthIndex].total += order.total;
          }
        });
        monthlySalesData = monthlyData;

        ordersToday = todayOrders.length;

        // Fetch Recent Sales
        const recentOrders = await db.order.findMany({
          where: { organizationId: user.organizationId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { user: true, customer: true }
        });

        recentSales = recentOrders.map(order => ({
          id: order.id,
          name: order.customer?.name || order.user?.name || "Unknown",
          email: order.customer?.email || order.user?.email || "No email",
          amount: order.total
        }));
      }
    }
  } catch (error) {
    console.error("Error loading dashboard data", error);
    // Keep default zero values so the dashboard still renders
  }

  const requiredOnboardingItems = onboardingItems.filter((item) => item.required !== false);
  return (
    <div className="portal-page space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Store</p>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Overview</h2>
        </div>
        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
          <Link href="/dashboard/orders">
            <Button className="w-full">Orders</Button>
          </Link>
          {storeUrl !== "#" && (
            <Link href={storeUrl} target="_blank">
              <Button variant="outline" className="gap-2 w-full justify-center">
                Shop <ExternalLink className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </div>
      {sellingAccess ? (
        <div>
          <SellingAccessAlert
            canSell={sellingAccess.canSell}
            reason={sellingAccess.reason}
            nextActionHref={sellingAccess.nextActionHref}
            nextActionLabel={sellingAccess.nextActionLabel}
          />
        </div>
      ) : null}

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
            <p className="font-semibold">Operations look clean</p>
            <p>No urgent alerts.</p>
          </div>
        </div>
      )}

      <CreditStatusCard href="/dashboard/credit" enabled={creditEnabled} limit={creditLimit} balance={walletBalance} dueAt={creditDueAt} />

      {!onboardingIsReady ? (
        <Card className="premium-surface overflow-hidden rounded-lg">
          <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div className="flex min-w-0 items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="truncate text-sm font-semibold">Setup {onboardingCompleteCount}/{requiredOnboardingItems.length || 5}</p>
            </div>
            <Button asChild size="sm"><Link href="/dashboard/setup">Continue</Link></Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4">
        <MetricCard
          label="Revenue"
          value={formatGhanaCedis(revenueToday)}
          description={`${ordersToday} order${ordersToday === 1 ? "" : "s"} today`}
          icon={CreditCard}
          tone="success"
        />
        <MetricCard
          label="Profit"
          value={formatGhanaCedis(profitToday)}
          description="Completed sales"
          icon={TrendingUp}
          tone="primary"
        />
        <MetricCard
          label="To process"
          value={pendingManualOrders + processingManualOrders}
          description={`${pendingManualOrders} pending, ${processingManualOrders} processing`}
          icon={Wrench}
          tone={pendingManualOrders > 0 ? "warning" : "success"}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <Card className="premium-surface overflow-hidden rounded-lg">
        <CardHeader className="border-b bg-muted/30 pb-3">
          <CardTitle className="text-sm font-semibold text-foreground">Sales channels</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-0 p-0 md:grid-cols-3 xl:grid-cols-5">
          {channelMetrics.map((channel) => (
            <Link key={channel.key} href={channel.href} className="flex min-w-0 items-center justify-between gap-2 border-b border-r border-border/60 p-3 transition-colors hover:bg-muted/40">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">{channel.label}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{channel.count} order{channel.count === 1 ? "" : "s"}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-semibold text-foreground">{formatGhanaCedis(channel.revenue)}</p>
                <p className={channel.profit > 0 ? "text-[10px] font-medium text-primary" : "text-[10px] text-muted-foreground"}>{formatGhanaCedis(channel.profit)} profit</p>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>

      {/* Main Analytics Section */}
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-7">
        <Card className="premium-surface col-span-1 rounded-lg lg:col-span-4">
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <Overview data={monthlySalesData} />
          </CardContent>
        </Card>
        <Card className="premium-surface col-span-1 rounded-lg lg:col-span-3">
          <CardHeader>
            <CardTitle>Recent Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <RecentSales sales={recentSales} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
