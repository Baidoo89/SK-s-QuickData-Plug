import Link from "next/link";
import type { ComponentType } from "react";
import { ExternalLink, Activity, AlertTriangle, CheckCircle2, Circle, CreditCard, FileText, Package, Settings, TrendingUp, UserCheck, Users, WalletCards, Wrench, Zap } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/ui/metric-card";
import { Overview } from "@/components/overview";
import { RecentSales } from "@/components/recent-sales";
import { StoreLinkCard } from "@/components/dashboard/store-link-card";
import { SellingAccessAlert } from "@/components/access/selling-access-alert";
import { formatGhanaCedis } from "@/lib/currency";
import { getStoredOrganizationPaymentSettings } from "@/lib/organization-payment-settings";
import { isSubscriptionActive } from "@/lib/subscription-access";
import { getOrganizationSellingAccess, type SellingAccessStatus } from "@/lib/selling-access";
import { getDispatchMetaByOrderIds } from "@/lib/admin-order-dispatch";
import { getEffectiveProviderConnection } from "@/lib/provider-connection";
import { getOrCreateSubscriberStorefrontLink } from "@/lib/storefront-links";

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

export default async function DashboardPage() {
  const session = await auth();
  
  let storeUrl = "#";
  let totalRevenue = 0;
  let revenueToday = 0;
  let revenueThisWeek = 0;
  let revenueThisMonth = 0;
  let profitToday = 0;
  let profitThisWeek = 0;
  let profitThisMonth = 0;
  let changeTodayVsYesterday = 0;
  let changeWeekVsLastWeek = 0;
  let changeMonthVsLastMonth = 0;
  let totalOrders = 0;
  let ordersToday = 0;
  let completedOrders = 0;
  let successRate = 0;
  let totalCustomers = 0;
  let pendingAgentApprovals = 0;
  let pendingResellerApprovals = 0;
  let totalApiKeys = 0;
  let activeApiKeys24h = 0;
  let staleApiKeys = 0;
  let pendingManualOrders = 0;
  let processingManualOrders = 0;
  let apiOrdersToday = 0;
  let apiRevenueToday = 0;
  let storefrontSalesToday = 0;
  let dashboardBuysToday = 0;
  let failedOrdersToday = 0;
  let walletBackedPurchasesToday = 0;
  let serviceRequestsToday = 0;
  let pendingServiceRequests = 0;
  let serviceRevenueToday = 0;
  let activeServiceProducts = 0;
  let providerConnected = false;
  let walletBalance = 0;
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
        const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Start of week (Monday) in local time
        const day = now.getDay(); // 0 (Sun) - 6 (Sat)
        const diffToMonday = (day + 6) % 7; // 0 -> Mon, 6 -> Sun
        const startOfWeek = new Date(startOfToday);
        startOfWeek.setDate(startOfToday.getDate() - diffToMonday);

        // Start of month
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [pendingAgentsCount, pendingResellersCount, apiKeys, todayProfitAgg, weekProfitAgg, monthProfitAgg, productCount, basePriceCount, agentCount, paymentSettings, providerConnection, manualCandidates, todayOrders, walletAgg, todayServiceRows, pendingServiceCount, serviceProductCount] = await Promise.all([
          db.user.count({
            where: {
              organizationId: user.organizationId,
              role: "AGENT",
              signupStatus: "PENDING",
            },
          }),
          db.user.count({
            where: {
              organizationId: user.organizationId,
              role: "RESELLER",
              signupStatus: "PENDING",
            },
          }),
          db.apiKey.findMany({
            where: { organizationId: user.organizationId },
            select: { id: true, lastUsed: true },
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
          db.orderItem.aggregate({
            _sum: { profit: true },
            where: {
              order: {
                organizationId: user.organizationId,
                status: "COMPLETED",
                createdAt: { gte: startOfWeek },
              },
            },
          }),
          db.orderItem.aggregate({
            _sum: { profit: true },
            where: {
              order: {
                organizationId: user.organizationId,
                status: "COMPLETED",
                createdAt: { gte: startOfMonth },
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
          db.serviceRequest.findMany({
            where: {
              organizationId: user.organizationId,
              createdAt: { gte: startOfToday },
            },
            select: { total: true },
          }),
          db.serviceRequest.count({
            where: {
              organizationId: user.organizationId,
              status: "PENDING_REVIEW",
              paymentStatus: "PAID",
            },
          }),
          db.product.count({
            where: {
              organizationId: user.organizationId,
              active: true,
              category: { in: ["REGISTRATION_SERVICE", "AFA_REGISTRATION"] },
            },
          }),
        ]);

        const subscriptionActive = isSubscriptionActive(user.organization?.subscription);
        const paystackConnected = Boolean(paymentSettings?.paystackConnected);
        providerConnected = Boolean(providerConnection.providerOrderUrl);
        const productsReady = productCount > 0;
        const pricingReady = basePriceCount > 0;
        const apiReady = apiKeys.length > 0;
        const agentsReady = agentCount > 0;
        const storefrontReady = Boolean(user.organization?.slug && subscriptionActive && paystackConnected && productsReady && pricingReady);
        sellingAccess = await getOrganizationSellingAccess(user.organizationId);

        onboardingItems = [
          {
            label: "Active subscription",
            description: subscriptionActive ? "Selling access is active." : "Choose or activate a SaaS plan.",
            href: "/dashboard/subscription",
            complete: subscriptionActive,
            icon: CreditCard,
          },
          {
            label: "Paystack connected",
            description: paystackConnected ? "Customer payments settle to your Paystack." : "Connect your Paystack public and secret keys.",
            href: "/dashboard/settings",
            complete: paystackConnected,
            icon: WalletCards,
          },
          {
            label: "Products created",
            description: productsReady ? `${productCount} active product${productCount === 1 ? "" : "s"} available.` : "Create active bundles or products for your storefront.",
            href: "/dashboard/products",
            complete: productsReady,
            icon: Package,
          },
          {
            label: "Base pricing set",
            description: pricingReady ? `${basePriceCount} price record${basePriceCount === 1 ? "" : "s"} configured.` : "Set the prices customers will pay.",
            href: "/dashboard/products",
            complete: pricingReady,
            icon: Settings,
          },
          {
            label: "Storefront ready",
            description: storefrontReady ? "Public checkout can accept paid orders." : "Requires subscription, Paystack, products, and prices.",
            href: storeUrl !== "#" ? storeUrl : "/dashboard/settings",
            complete: storefrontReady,
            icon: ExternalLink,
          },
          {
            label: "Sales channels",
            description: agentsReady ? `${agentCount} active agent${agentCount === 1 ? "" : "s"} available.` : "Optional: add agents or resellers for wider selling.",
            href: "/dashboard/agents",
            complete: agentsReady,
            required: false,
            icon: Users,
          },
          {
            label: "API access",
            description: apiReady ? `${apiKeys.length} API key${apiKeys.length === 1 ? "" : "s"} created.` : "Optional: create an API key for programmatic orders.",
            href: "/dashboard/settings",
            complete: apiReady,
            required: false,
            icon: Activity,
          },
        ];
        onboardingCompleteCount = onboardingItems.filter((item) => item.required !== false && item.complete).length;
        onboardingIsReady = storefrontReady;

        pendingAgentApprovals = pendingAgentsCount;
        pendingResellerApprovals = pendingResellersCount;
        totalApiKeys = apiKeys.length;
        activeApiKeys24h = apiKeys.filter((key) => key.lastUsed && key.lastUsed >= dayAgo).length;
        staleApiKeys = apiKeys.filter((key) => !key.lastUsed || key.lastUsed < monthAgo).length;
        profitToday = todayProfitAgg._sum.profit ?? 0;
        profitThisWeek = weekProfitAgg._sum.profit ?? 0;
        profitThisMonth = monthProfitAgg._sum.profit ?? 0;
        walletBalance = walletAgg._sum.amount ?? 0;
        serviceRequestsToday = todayServiceRows.length;
        pendingServiceRequests = pendingServiceCount;
        serviceRevenueToday = todayServiceRows.reduce((sum, request) => sum + request.total, 0);
        activeServiceProducts = serviceProductCount;

        const manualDispatchMap = await getDispatchMetaByOrderIds(manualCandidates.map((order) => order.id));
        const manualRows = manualCandidates.filter((order) => (manualDispatchMap.get(order.id)?.mode || "MANUAL") === "MANUAL");
        pendingManualOrders = manualRows.filter((order) => order.status === "PENDING").length;
        processingManualOrders = manualRows.filter((order) => order.status === "PROCESSING").length;

        const summarizeOrders = (orders: typeof todayOrders) => ({
          count: orders.length,
          revenue: orders.reduce((sum, order) => sum + order.total, 0),
          profit: orders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.profit, 0), 0),
          pending: orders.filter((order) => ["PENDING", "PROCESSING", "PENDING_PAYMENT"].includes(order.status)).length,
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

        apiOrdersToday = apiSummary.count;
        apiRevenueToday = apiSummary.revenue;
        storefrontSalesToday = storefrontSummary.count;
        dashboardBuysToday = dashboardBuySummary.count;
        failedOrdersToday = todayOrders.filter((order) => ["FAILED", "CANCELLED", "REFUNDED", "PAYMENT_FAILED"].includes(order.status)).length;
        walletBackedPurchasesToday = todayOrders.filter((order) => order.paymentOwner === "WALLET").length;
        channelMetrics = [
          { key: "api", label: "API sales", ...apiSummary, href: "/dashboard/orders?source=API" },
          { key: "storefront", label: "Storefront sales", ...storefrontSummary, href: "/dashboard/orders?source=STOREFRONT" },
          { key: "dashboard", label: "Dashboard buys", ...dashboardBuySummary, href: "/dashboard/orders?source=DASHBOARD" },
          { key: "agent", label: "Agent activity", ...agentSummary, href: "/dashboard/orders?source=AGENT" },
          { key: "reseller", label: "Reseller activity", ...resellerSummary, href: "/dashboard/orders?source=RESELLER" },
        ];

        alertItems = [
          ...(!subscriptionActive ? [{
            label: "Subscription inactive",
            description: "Selling channels are blocked until your SaaS plan is active.",
            href: "/dashboard/subscription",
            action: "Manage subscription",
            tone: "warning" as const,
          }] : []),
          ...(!paystackConnected ? [{
            label: "Paystack not connected",
            description: "Storefront customer payments need your own Paystack keys.",
            href: "/dashboard/settings",
            action: "Connect Paystack",
            tone: "warning" as const,
          }] : []),
          ...(!providerConnected ? [{
            label: "Provider API not connected",
            description: "Orders will stay manual until provider dispatch is configured.",
            href: "/dashboard/settings",
            action: "Review provider",
            tone: "info" as const,
          }] : []),
          ...(pendingManualOrders > 0 ? [{
            label: "Orders need fulfillment",
            description: `${pendingManualOrders} paid order${pendingManualOrders === 1 ? "" : "s"} waiting to be claimed.`,
            href: "/dashboard/orders",
            action: "Open orders",
            tone: "warning" as const,
          }] : []),
          ...(pendingServiceRequests > 0 ? [{
            label: "Service requests need review",
            description: `${pendingServiceRequests} paid service request${pendingServiceRequests === 1 ? "" : "s"} waiting for processing.`,
            href: "/dashboard/service-requests?status=PENDING_REVIEW",
            action: "Review services",
            tone: "warning" as const,
          }] : []),
          ...(!productsReady ? [{
            label: "No active products",
            description: "Create active bundles before sharing your storefront.",
            href: "/dashboard/products",
            action: "Add products",
            tone: "warning" as const,
          }] : []),
        ];

        // Fetch revenue-related data (completed orders for revenue)
        const completedOrdersData = await db.order.findMany({
          where: { 
            organizationId: user.organizationId,
            status: "COMPLETED" // Assuming we only count completed orders
          },
          select: { total: true, createdAt: true }
        });
        totalRevenue = completedOrdersData.reduce((acc, order) => acc + order.total, 0);

        // Initialize monthly data (for the chart) and compute period revenues
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const currentYear = now.getFullYear();
        const monthlyData = months.map(month => ({ name: month, total: 0 }));

        // Previous period boundaries
        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfToday.getDate() - 1);
        const endOfYesterday = new Date(startOfToday);

        const startOfLastWeek = new Date(startOfWeek);
        startOfLastWeek.setDate(startOfWeek.getDate() - 7);
        const endOfLastWeek = new Date(startOfWeek);

        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        let revenueYesterday = 0;
        let revenueLastWeek = 0;
        let revenueLastMonth = 0;

        completedOrdersData.forEach(order => {
          const date = new Date(order.createdAt);

          // Per-period revenue
          if (date >= startOfToday) {
            revenueToday += order.total;
          }
          if (date >= startOfWeek) {
            revenueThisWeek += order.total;
          }
          if (date >= startOfMonth) {
            revenueThisMonth += order.total;
          }

           // Previous periods
           if (date >= startOfYesterday && date < endOfYesterday) {
            revenueYesterday += order.total;
           }
           if (date >= startOfLastWeek && date < endOfLastWeek) {
            revenueLastWeek += order.total;
           }
           if (date >= startOfLastMonth && date < endOfLastMonth) {
            revenueLastMonth += order.total;
           }

          // Monthly aggregation for the current year
          if (date.getFullYear() === currentYear) {
            const monthIndex = date.getMonth();
            monthlyData[monthIndex].total += order.total;
          }
        });
        monthlySalesData = monthlyData;

        // Compute percentage changes vs previous periods (defensive against division by zero)
        if (revenueYesterday > 0) {
          changeTodayVsYesterday = ((revenueToday - revenueYesterday) / revenueYesterday) * 100;
        }
        if (revenueLastWeek > 0) {
          changeWeekVsLastWeek = ((revenueThisWeek - revenueLastWeek) / revenueLastWeek) * 100;
        }
        if (revenueLastMonth > 0) {
          changeMonthVsLastMonth = ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100;
        }

        // Fetch Total Orders
        totalOrders = await db.order.count({
          where: { organizationId: user.organizationId }
        });
        ordersToday = await db.order.count({
          where: {
            organizationId: user.organizationId,
            createdAt: { gte: startOfToday },
          },
        });

        // Success breakdown
        completedOrders = await db.order.count({
          where: { organizationId: user.organizationId, status: "COMPLETED" }
        });
        if (totalOrders > 0) {
          successRate = (completedOrders / totalOrders) * 100;
        }

        // Fetch Total Customers
        totalCustomers = await db.customer.count({
          where: { organizationId: user.organizationId }
        });

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
  const optionalOnboardingItems = onboardingItems.filter((item) => item.required === false);
  const renderOnboardingItem = (item: OnboardingItem) => {
    const Icon = item.icon;
    const content = (
      <div className="flex h-full gap-3 rounded-md border border-border bg-background p-3 transition-colors hover:bg-muted/40">
        <div className={item.complete ? "mt-0.5 text-primary" : "mt-0.5 text-muted-foreground"}>
          {item.complete ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="truncate text-sm font-semibold text-foreground">{item.label}</p>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
        </div>
      </div>
    );

    return item.href.startsWith("/store/") || item.href.startsWith("/shop/") ? (
      <Link key={item.label} href={item.href} target="_blank">
        {content}
      </Link>
    ) : (
      <Link key={item.label} href={item.href}>
        {content}
      </Link>
    );
  };

  return (
    <div className="portal-page space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Subscriber workspace</p>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Command Center</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Watch selling access, customer payments, manual fulfillment, and channel performance from one place.
          </p>
        </div>
        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
          <Link href="/dashboard/orders">
            <Button className="w-full">Open Orders</Button>
          </Link>
          {storeUrl !== "#" && (
            <Link href={storeUrl} target="_blank">
              <Button variant="outline" className="gap-2 w-full justify-center">
                View Store <ExternalLink className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </div>
      <StoreLinkCard storePath={storeUrl !== "#" ? storeUrl : null} />

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
              Operational alerts
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
            <p>No urgent setup, payment, or manual fulfillment alerts are active.</p>
          </div>
        </div>
      )}

      <Card className="premium-surface overflow-hidden rounded-lg">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CheckCircle2 className={onboardingIsReady ? "h-5 w-5 text-primary" : "h-5 w-5 text-muted-foreground"} />
                Launch checklist
              </CardTitle>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Complete the required checks before sharing your storefront for paid customer orders. Agent and API channels can come after launch.
              </p>
            </div>
            <Badge variant={onboardingIsReady ? "secondary" : "outline"} className={onboardingIsReady ? "bg-primary/10 text-primary" : ""}>
              {onboardingCompleteCount}/{requiredOnboardingItems.length || 5} required
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {requiredOnboardingItems.map(renderOnboardingItem)}
          </div>
          {optionalOnboardingItems.length > 0 ? (
            <div className="mt-4 border-t pt-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Growth channels</p>
                <Badge variant="outline" className="text-xs">
                  Optional
                </Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {optionalOnboardingItems.map(renderOnboardingItem)}
              </div>
            </div>
          ) : null}
          {!onboardingIsReady ? (
            <div className="status-warning mt-4 rounded-md border px-4 py-3 text-sm">
              Selling is blocked until the required billing, Paystack, product, and pricing steps are complete.
            </div>
          ) : (
            <div className="status-success mt-4 rounded-md border px-4 py-3 text-sm">
              Your storefront is ready to accept paid orders into the manual fulfillment queue.
            </div>
          )}
          <div className="mt-4">
            <Button asChild variant={onboardingIsReady ? "outline" : "default"} size="sm">
              <Link href="/dashboard/setup">
                {onboardingIsReady ? "Review Launch Setup" : "Continue Launch Setup"}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Revenue Today"
          value={formatGhanaCedis(revenueToday)}
          description={`${ordersToday} order${ordersToday === 1 ? "" : "s"} submitted today`}
          icon={CreditCard}
          tone="success"
        />
        <MetricCard
          label="Profit Today"
          value={formatGhanaCedis(profitToday)}
          description="Completed customer-sale profit"
          icon={TrendingUp}
          tone="primary"
        />
        <MetricCard
          label="Fulfillment Work"
          value={pendingManualOrders + processingManualOrders}
          description={`${pendingManualOrders} pending, ${processingManualOrders} processing`}
          icon={Wrench}
          tone={pendingManualOrders > 0 ? "warning" : "success"}
        />
        <MetricCard
          label="External Sales"
          value={apiOrdersToday + storefrontSalesToday}
          description={`${apiOrdersToday} API, ${storefrontSalesToday} storefront`}
          icon={Zap}
          tone="primary"
        />
        <MetricCard
          label="Service Requests"
          value={pendingServiceRequests}
          description={`${serviceRequestsToday} today, ${formatGhanaCedis(serviceRevenueToday)} paid value`}
          icon={FileText}
          tone={pendingServiceRequests > 0 ? "warning" : activeServiceProducts > 0 ? "primary" : "info"}
        />
      </div>

      <Card className="premium-surface overflow-hidden rounded-lg">
        <CardHeader className="border-b bg-muted/30 pb-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">Channel performance today</CardTitle>
              <p className="text-xs text-muted-foreground">Source-aware sales, buys, profit, and pending work using the new order metadata.</p>
            </div>
            <Badge variant="outline" className="w-fit text-xs">
              {dashboardBuysToday} dashboard buy{dashboardBuysToday === 1 ? "" : "s"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
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

      <Card className="premium-surface overflow-hidden rounded-lg">
        <CardHeader className="border-b bg-muted/30 pb-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">Revenue Periods</CardTitle>
              <p className="text-xs text-muted-foreground">Revenue and profit from completed orders, summarized for quick review.</p>
            </div>
            <Badge variant="outline" className="w-fit text-xs">
              Today {changeTodayVsYesterday >= 0 ? "+" : ""}{changeTodayVsYesterday.toFixed(1)}%
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border/70 bg-background/80 p-3 shadow-sm">
              <p className="text-xs font-medium text-muted-foreground">Today</p>
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Revenue</span>
                  <span className="font-semibold text-foreground">{formatGhanaCedis(revenueToday)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Profit</span>
                  <span className="font-semibold text-foreground">{formatGhanaCedis(profitToday)}</span>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/80 p-3 shadow-sm">
              <p className="text-xs font-medium text-muted-foreground">This week</p>
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Revenue</span>
                  <span className="font-semibold text-foreground">{formatGhanaCedis(revenueThisWeek)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Profit</span>
                  <span className="font-semibold text-foreground">{formatGhanaCedis(profitThisWeek)}</span>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/80 p-3 shadow-sm">
              <p className="text-xs font-medium text-muted-foreground">This month</p>
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Revenue</span>
                  <span className="font-semibold text-foreground">{formatGhanaCedis(revenueThisMonth)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Profit</span>
                  <span className="font-semibold text-foreground">{formatGhanaCedis(profitThisMonth)}</span>
                </div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Trend: {changeTodayVsYesterday >= 0 ? "+" : ""}{changeTodayVsYesterday.toFixed(1)}% today, {changeWeekVsLastWeek >= 0 ? "+" : ""}{changeWeekVsLastWeek.toFixed(1)}% week, {changeMonthVsLastMonth >= 0 ? "+" : ""}{changeMonthVsLastMonth.toFixed(1)}% month.
          </p>
        </CardContent>
      </Card>

      <Card className="premium-surface overflow-hidden rounded-lg">
        <CardHeader className="border-b bg-muted/30 pb-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">Business Health</CardTitle>
              <p className="text-xs text-muted-foreground">Stable operating signals without crowding the daily command cards.</p>
            </div>
            <Badge variant={successRate >= 90 || totalOrders === 0 ? "secondary" : "outline"} className="w-fit text-xs">
              {successRate.toFixed(1)}% success
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-border/70 bg-background/80 p-3 shadow-sm">
            <p className="text-xs text-muted-foreground">All-time revenue</p>
            <p className="mt-1 text-lg font-semibold">{formatGhanaCedis(totalRevenue)}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/80 p-3 shadow-sm">
            <p className="text-xs text-muted-foreground">Orders and customers</p>
            <p className="mt-1 text-lg font-semibold">{totalOrders} / {totalCustomers}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/80 p-3 shadow-sm">
            <p className="text-xs text-muted-foreground">Failed today</p>
            <p className={failedOrdersToday > 0 ? "mt-1 text-lg font-semibold text-amber-700" : "mt-1 text-lg font-semibold text-primary"}>{failedOrdersToday}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/80 p-3 shadow-sm">
            <p className="text-xs text-muted-foreground">Wallet buys today</p>
            <p className="mt-1 text-lg font-semibold">{walletBackedPurchasesToday}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Balance {formatGhanaCedis(walletBalance)}</p>
          </div>
          {(pendingAgentApprovals + pendingResellerApprovals > 0 || totalApiKeys > 0 || apiOrdersToday > 0) ? (
            <div className="rounded-lg border border-border/70 bg-background/80 p-3 shadow-sm sm:col-span-2 xl:col-span-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Approvals</p>
                  <p className="mt-1 text-sm font-semibold">{pendingAgentApprovals} agents, {pendingResellerApprovals} resellers</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">API today</p>
                  <p className="mt-1 text-sm font-semibold">{apiOrdersToday} orders, {formatGhanaCedis(apiRevenueToday)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">API keys</p>
                  <p className="mt-1 text-sm font-semibold">{activeApiKeys24h} active, {staleApiKeys} stale</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:flex xl:items-end">
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link href="/dashboard/approvals">Approvals</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link href="/dashboard/settings">API keys</Link>
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
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
            <div className="text-sm text-muted-foreground">You made {recentSales.length} sales recently.</div>
          </CardHeader>
          <CardContent>
            <RecentSales sales={recentSales} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
