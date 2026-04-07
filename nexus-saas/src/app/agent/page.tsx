import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LineChart, ShoppingBag, Wallet, FileText } from "lucide-react"
import { formatGhanaCedis } from "@/lib/currency"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { CopyLinkButton } from "./copy-link-button"

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
  if (!session?.user?.email) return null

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, email: true, role: true, organizationId: true, agentId: true, organization: { select: { slug: true, name: true } } },
  })

  if (!user || user.role !== "AGENT") return null

  const now = new Date()
  const selectedProfitRange = resolveProfitRange(searchParams?.profitRange)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const profitStart = getRangeStart(now, selectedProfitRange)

  const [walletAgg, todaysOrdersCount, monthCompletedAgg, filteredSalesAgg, todayProfitAgg, activeResellersCount] = await Promise.all([
    db.walletTransaction.aggregate({
      _sum: { amount: true },
      where: { userId: user.id, status: "success" },
    }),
    db.order.count({
      where: {
        agentId: user.agentId ?? undefined,
        createdAt: { gte: startOfToday },
      },
    }),
    db.order.aggregate({
      _sum: { total: true },
      where: {
        agentId: user.agentId ?? undefined,
        status: "COMPLETED",
        createdAt: { gte: startOfMonth },
      },
    }),
    db.order.aggregate({
      _sum: { total: true },
      where: {
        agentId: user.agentId ?? undefined,
        status: "COMPLETED",
        createdAt: { gte: profitStart },
      },
    }),
    db.orderItem.aggregate({
      _sum: { profit: true },
      where: {
        order: {
          agentId: user.agentId ?? undefined,
          status: "COMPLETED",
          createdAt: { gte: profitStart },
        },
      },
    }),
    db.user.count({
      where: { parentAgentId: user.agentId ?? undefined, role: "RESELLER" },
    }),
  ])

  const walletBalance = walletAgg._sum.amount ?? 0
  const monthCompletedTotal = monthCompletedAgg._sum.total ?? 0
  const todayProfit = todayProfitAgg._sum.profit ?? 0
  const filteredSales = filteredSalesAgg._sum.total ?? 0
  const marginPercent = filteredSales > 0 ? (todayProfit / filteredSales) * 100 : 0
  const orgSlug = user.organization?.slug ?? null
  const orgName = user.organization?.name ?? null
  const greeting = getGreetingByTime(now)
  const displayName = getDisplayName(user.name, user.email)
  const selectedProfitRangeLabel = getRangeLabel(selectedProfitRange)

  return (
    <div className="space-y-6">
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Wallet className="h-3 w-3" /> Wallet balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatGhanaCedis(walletBalance)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Based on successful wallet transactions. Visit the wallet tab to top up.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <LineChart className="h-3 w-3" /> Today&apos;s orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{todaysOrdersCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">VTU orders placed through your account today.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">This month sales</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatGhanaCedis(monthCompletedTotal)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Total completed VTU sales for the current month.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Profit ({selectedProfitRangeLabel})</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatGhanaCedis(todayProfit)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Filtered profit from completed reseller and agent orders.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Margin ({selectedProfitRangeLabel})</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{marginPercent.toFixed(1)}%</p>
            <p className="mt-1 text-xs text-muted-foreground">Profit as a percentage of completed sales in this range.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Active resellers</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{activeResellersCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">Resellers you currently manage under your account.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Quick actions</CardTitle>
          <CardDescription className="text-xs">
            Shortcuts to the tasks you use most often.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          </div>
        </CardContent>
      </Card>

      {orgSlug && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Your storefront link</CardTitle>
            <CardDescription className="text-xs">
              Share this link with your customers so they can buy bundles from your store.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CopyLinkButton slug={orgSlug} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
