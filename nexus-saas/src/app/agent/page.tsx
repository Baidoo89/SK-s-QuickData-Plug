import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, AlertTriangle, CheckCircle2, FileText, LineChart, Megaphone, ShoppingBag, Store, TrendingUp, Users, Wallet } from "lucide-react"
import { formatGhanaCedis } from "@/lib/currency"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { CopyLinkButton } from "./copy-link-button"
import { Button } from "@/components/ui/button"
import { MetricCard } from "@/components/ui/metric-card"
import { PortalAccessMessage } from "@/components/access/portal-access-message"
import { Badge } from "@/components/ui/badge"
import { getUserWithdrawableSummary } from "@/lib/withdrawal-balance"
import { getOrCreateAgentStorefrontLink } from "@/lib/storefront-links"

function getGreetingByTime(date: Date): string {
  const hour = date.getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

function getDisplayName(name: string | null | undefined, email: string | null | undefined): string {
  const trimmedName = name?.trim()
  if (trimmedName) return trimmedName
  const emailPrefix = email?.split("@")[0]?.trim()
  return emailPrefix || "there"
}

type ProfitRangeKey = "daily" | "weekly" | "monthly"

type ChannelMetric = {
  key: string
  label: string
  count: number
  revenue: number
  profit: number
  pending: number
  href: string
}

type AlertItem = {
  label: string
  description: string
  href: string
  action: string
  tone: "warning" | "info"
}

function resolveProfitRange(input?: string): ProfitRangeKey {
  if (input === "weekly" || input === "monthly") return input
  return "daily"
}

function getRangeStart(now: Date, range: ProfitRangeKey): Date {
  if (range === "monthly") return new Date(now.getFullYear(), now.getMonth(), 1)
  if (range === "weekly") return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function getRangeLabel(range: ProfitRangeKey): string {
  if (range === "weekly") return "Last 7 days"
  if (range === "monthly") return "This month"
  return "Today"
}

export default async function AgentOverviewPage({ searchParams }: { searchParams?: { profitRange?: string } }) {
  const session = await auth()
  if (!session?.user?.email) {
    return <PortalAccessMessage title="Login required" description="Sign in with an approved agent account to access this workspace." />
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, email: true, role: true, organizationId: true, agentId: true, organization: { select: { slug: true, name: true } } },
  })

  if (!user || user.role !== "AGENT") {
    return <PortalAccessMessage title="Agent profile unavailable" description="This account is not linked to an approved agent profile. Ask the subscriber admin to review the account." />
  }

  let agentId = user.agentId
  if (!agentId && user.organizationId) {
    const fallbackAgent = await db.agent.findFirst({
      where: { organizationId: user.organizationId, user: { id: user.id } },
      select: { id: true },
    })
    agentId = fallbackAgent?.id ?? null
  }

  if (!agentId || !user.organizationId) {
    return <PortalAccessMessage title="Agent profile unavailable" description="This account is not linked to an agent profile yet. Ask the subscriber admin to complete the agent setup." />
  }

  const now = new Date()
  const selectedProfitRange = resolveProfitRange(searchParams?.profitRange)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const day = now.getDay()
  const diffToMonday = (day + 6) % 7
  const startOfWeek = new Date(startOfToday)
  startOfWeek.setDate(startOfToday.getDate() - diffToMonday)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const profitStart = getRangeStart(now, selectedProfitRange)

  const [
    walletAgg,
    todaysOrders,
    completedOrders,
    selectedRangeOrders,
    activeResellersCount,
    pendingResellerApprovals,
    pendingResellerWithdrawals,
    withdrawalSummary,
    storefrontPriceCount,
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
        agentId,
        createdAt: { gte: startOfToday },
      },
      include: { items: true },
    }),
    db.order.findMany({
      where: {
        organizationId: user.organizationId,
        agentId,
        status: "COMPLETED",
        createdAt: { gte: startOfMonth },
      },
      include: { items: true },
    }),
    db.order.findMany({
      where: {
        organizationId: user.organizationId,
        agentId,
        status: "COMPLETED",
        createdAt: { gte: profitStart },
      },
      include: { items: true },
    }),
    db.user.count({
      where: { organizationId: user.organizationId, parentAgentId: agentId, role: "RESELLER", active: true },
    }),
    db.user.count({
      where: {
        organizationId: user.organizationId,
        parentAgentId: agentId,
        role: "RESELLER",
        signupStatus: "PENDING",
      },
    }),
    db.withdrawalRequest.count({
      where: {
        organizationId: user.organizationId,
        status: { in: ["PENDING", "APPROVED"] },
        user: { role: "RESELLER", parentAgentId: agentId },
      },
    }),
    getUserWithdrawableSummary(user.id),
    db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "AgentStorefrontPrice"
      WHERE "agentId" = ${agentId}
        AND "organizationId" = ${user.organizationId}
    `,
    db.order.count({
      where: {
        organizationId: user.organizationId,
        agentId,
        status: { in: ["PENDING", "PROCESSING"] },
        paymentStatus: "PAID",
        fulfillmentMode: "MANUAL",
      },
    }),
    db.serviceRequest.findMany({
      where: {
        organizationId: user.organizationId,
        OR: [{ sellerAgentId: agentId }, { agentId }],
        createdAt: { gte: startOfToday },
      },
      select: { total: true, profit: true },
    }),
    db.serviceRequest.count({
      where: {
        organizationId: user.organizationId,
        OR: [{ sellerAgentId: agentId }, { agentId }],
        status: "PENDING_REVIEW",
        paymentStatus: "PAID",
      },
    }),
  ])

  const walletBalance = walletAgg._sum.amount ?? 0
  const todayCompletedOrders = todaysOrders.filter((order) => order.status === "COMPLETED")
  const todayBuys = todaysOrders.filter((order) => order.source === "DASHBOARD_BUY" && order.sellerUserId === user.id)
  const todayStorefrontSales = todaysOrders.filter((order) => order.source === "STOREFRONT" && order.sellerRole === "AGENT" && order.sellerAgentId === agentId)
  const todayResellerActivity = todaysOrders.filter((order) => order.sellerRole === "RESELLER")
  const dailySales = todayCompletedOrders.reduce((sum, order) => sum + order.total, 0)
  const weeklySales = completedOrders
    .filter((order) => order.createdAt >= startOfWeek)
    .reduce((sum, order) => sum + order.total, 0)
  const monthCompletedTotal = completedOrders.reduce((sum, order) => sum + order.total, 0)
  const dailyProfit = todayCompletedOrders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.profit, 0), 0)
  const weeklyProfit = completedOrders
    .filter((order) => order.createdAt >= startOfWeek)
    .reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.profit, 0), 0)
  const monthProfit = completedOrders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.profit, 0), 0)
  const selectedProfit = selectedRangeOrders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.profit, 0), 0)
  const filteredSales = selectedRangeOrders.reduce((sum, order) => sum + order.total, 0)
  const serviceRevenueToday = todayServiceRequests.reduce((sum, request) => sum + request.total, 0)
  const serviceProfitToday = todayServiceRequests.reduce((sum, request) => sum + request.profit, 0)
  const todaysOrdersCount = todaysOrders.length
  const storefrontPriceTotal = Number(storefrontPriceCount[0]?.count ?? 0)
  const orgSlug = user.organization?.slug ?? null
  const orgName = user.organization?.name ?? null
  const greeting = getGreetingByTime(now)
  const displayName = getDisplayName(user.name, user.email)
  const selectedProfitRangeLabel = getRangeLabel(selectedProfitRange)
  const agentStorePath = orgSlug
    ? await getOrCreateAgentStorefrontLink({
        organizationId: user.organizationId,
        organizationSlug: orgSlug,
        agentId,
        agentName: displayName,
      })
    : null

  function summarize(orders: typeof todaysOrders) {
    return {
      count: orders.length,
      revenue: orders.reduce((sum, order) => sum + order.total, 0),
      profit: orders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.profit, 0), 0),
      pending: orders.filter((order) => ["PENDING", "PROCESSING", "PENDING_PAYMENT"].includes(order.status)).length,
    }
  }

  const channelMetrics: ChannelMetric[] = [
    { key: "buys", label: "Dashboard buys", ...summarize(todayBuys), href: "/agent/orders" },
    { key: "storefront", label: "Storefront sales", ...summarize(todayStorefrontSales), href: "/agent/orders" },
    { key: "services", label: "Service requests", count: todayServiceRequests.length, revenue: serviceRevenueToday, profit: serviceProfitToday, pending: pendingServiceRequestCount, href: "/agent/service-requests" },
    { key: "resellers", label: "Reseller activity", ...summarize(todayResellerActivity), href: "/agent/resellers" },
  ]

  const alertItems: AlertItem[] = [
    ...(walletBalance <= 0 ? [{
      label: "Wallet needs funding",
      description: "Your dashboard buys need wallet balance before orders can be placed.",
      href: "/agent/wallet",
      action: "Open wallet",
      tone: "warning" as const,
    }] : []),
    ...(storefrontPriceTotal === 0 ? [{
      label: "No storefront customer prices",
      description: "Set customer-facing prices before sharing your agent storefront.",
      href: "/agent/storefront-pricing",
      action: "Set prices",
      tone: "warning" as const,
    }] : []),
    ...(pendingResellerApprovals > 0 ? [{
      label: "Reseller approvals waiting",
      description: `${pendingResellerApprovals} reseller request${pendingResellerApprovals === 1 ? "" : "s"} need review.`,
      href: "/agent/approvals",
      action: "Review",
      tone: "warning" as const,
    }] : []),
    ...(pendingResellerWithdrawals > 0 ? [{
      label: "Withdrawal reviews waiting",
      description: `${pendingResellerWithdrawals} reseller payout request${pendingResellerWithdrawals === 1 ? "" : "s"} are pending or approved.`,
      href: "/agent/withdrawals",
      action: "Review payouts",
      tone: "warning" as const,
    }] : []),
    ...(manualWorkCount > 0 ? [{
      label: "Manual work in progress",
      description: `${manualWorkCount} paid manual order${manualWorkCount === 1 ? "" : "s"} are tied to your agent channel.`,
      href: "/agent/orders",
      action: "View orders",
      tone: "info" as const,
    }] : []),
    ...(pendingServiceRequestCount > 0 ? [{
      label: "Service requests waiting",
      description: `${pendingServiceRequestCount} paid service request${pendingServiceRequestCount === 1 ? "" : "s"} are waiting for subscriber processing.`,
      href: "/agent/service-requests?status=PENDING_REVIEW",
      action: "View services",
      tone: "info" as const,
    }] : []),
  ]

  return (
    <div className="portal-page space-y-6">
      <div className="space-y-1">
        <p className="text-sm font-medium text-primary">{`${greeting}, ${displayName}.`}</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          {orgName ? `${orgName} agent dashboard` : "Agent dashboard"}
        </h1>
        <p className="text-sm text-muted-foreground">
          See your performance at a glance, buy data quickly, and manage your resellers.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          {([
            { key: "daily", label: "Daily" },
            { key: "weekly", label: "Weekly" },
            { key: "monthly", label: "Monthly" },
          ] as const).map((item) => {
            const active = selectedProfitRange === item.key
            const href = item.key === "daily" ? "/agent" : `/agent?profitRange=${item.key}`
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
            )
          })}
        </div>
      </div>

      {alertItems.length > 0 ? (
        <Card className="border border-border bg-card/95 shadow-sm">
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
            <p className="font-semibold">Agent operations look clean</p>
            <p>No wallet, pricing, approval, or withdrawal alerts are active.</p>
          </div>
        </div>
      )}

      <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-6">
        <MetricCard
          label="Wallet Balance"
          value={formatGhanaCedis(walletBalance)}
          description="Successful wallet transactions available for VTU orders."
          icon={Wallet}
          tone="success"
        />
        <MetricCard
          label="Today's Buys"
          value={todayBuys.length}
          description={`${todaysOrdersCount} total orders in your channel today.`}
          icon={LineChart}
          tone="info"
        />
        <MetricCard
          label="Storefront Sales"
          value={todayStorefrontSales.length}
          description={`Customer revenue ${formatGhanaCedis(todayStorefrontSales.reduce((sum, order) => sum + order.total, 0))}`}
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
          label="Active Resellers"
          value={activeResellersCount}
          description="Resellers currently managed under your account."
          icon={Users}
          tone={pendingResellerApprovals > 0 ? "warning" : "primary"}
        />
        <MetricCard
          label="Service Requests"
          value={pendingServiceRequestCount}
          description={`${todayServiceRequests.length} today, ${formatGhanaCedis(serviceRevenueToday)} value`}
          icon={FileText}
          tone={pendingServiceRequestCount > 0 ? "warning" : "primary"}
        />
        <Card className="md:col-span-2 lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Revenue snapshot</CardTitle>
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
              <span className="text-muted-foreground">Selected range ({selectedProfitRangeLabel})</span>
              <span className="font-semibold">{formatGhanaCedis(filteredSales)}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="md:col-span-2 lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Profit snapshot</CardTitle>
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
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Selected range ({selectedProfitRangeLabel})</span>
              <span className="font-semibold">{formatGhanaCedis(selectedProfit)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b bg-muted/30 pb-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">Channel performance today</CardTitle>
              <CardDescription className="text-xs">
                Dashboard buys are wallet operations. Storefront and reseller customer sales produce withdrawable profit.
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit">{manualWorkCount} manual</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          {channelMetrics.map((channel) => (
            <Link key={channel.key} href={channel.href} className="rounded-md border bg-background p-3 transition-colors hover:bg-muted/40">
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

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Quick actions</CardTitle>
          <CardDescription className="text-xs">
            Shortcuts to the tasks you use most often.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Link href="/agent/buy/single" className="group">
              <div className="flex items-center gap-3 rounded-md border bg-background px-3 py-2 transition-colors group-hover:border-primary">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ShoppingBag className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">Buy single data</p>
                  <p className="truncate text-[11px] text-muted-foreground">Send one bundle instantly.</p>
                </div>
              </div>
            </Link>
            <Link href="/agent/buy/bulk" className="group">
              <div className="flex items-center gap-3 rounded-md border bg-background px-3 py-2 transition-colors group-hover:border-primary">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ShoppingBag className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">Buy bulk data</p>
                  <p className="truncate text-[11px] text-muted-foreground">Upload many numbers at once.</p>
                </div>
              </div>
            </Link>
            <Link href="/agent/wallet" className="group">
              <div className="flex items-center gap-3 rounded-md border bg-background px-3 py-2 transition-colors group-hover:border-primary">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Wallet className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">View wallet</p>
                  <p className="truncate text-[11px] text-muted-foreground">Check balance and payouts.</p>
                </div>
              </div>
            </Link>
            <Link href="/agent/orders" className="group">
              <div className="flex items-center gap-3 rounded-md border bg-background px-3 py-2 transition-colors group-hover:border-primary">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">View orders</p>
                  <p className="truncate text-[11px] text-muted-foreground">Review your latest VTU activity.</p>
                </div>
              </div>
            </Link>
            <Link href="/agent/service-requests" className="group">
              <div className="flex items-center gap-3 rounded-md border bg-background px-3 py-2 transition-colors group-hover:border-primary">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">Service requests</p>
                  <p className="truncate text-[11px] text-muted-foreground">Track registration sales.</p>
                </div>
              </div>
            </Link>
            <Link href="/agent/storefront-pricing" className="group">
              <div className="flex items-center gap-3 rounded-md border bg-background px-3 py-2 transition-colors group-hover:border-primary">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Megaphone className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">Customer prices</p>
                  <p className="truncate text-[11px] text-muted-foreground">Set agent storefront margins.</p>
                </div>
              </div>
            </Link>
          </div>
        </CardContent>
      </Card>

      {agentStorePath && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Your storefront link</CardTitle>
            <CardDescription className="text-xs">
              Share this link with your customers so they can buy bundles from your store.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CopyLinkButton path={agentStorePath} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
