import { auth } from "@/auth"
import { db } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { MetricCard } from "@/components/ui/metric-card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { OrdersStatusTabs } from "@/components/dashboard/orders-status-tabs"
import { DashboardOrdersWorkspace, type DashboardOrderRow } from "@/components/dashboard/orders-workspace"
import { formatGhanaCedis } from "@/lib/currency"
import { getDispatchMetaByOrderIds } from "@/lib/admin-order-dispatch"
import { getOrderSourceLogMap, ORDER_SOURCE_LABELS, resolveOrderSource, type OrderSource } from "@/lib/order-source"
import { Activity, CheckCircle2, Clock, Download, ListFilter, ShoppingCart } from "lucide-react"

type OrderFilters = {
  status?: string
  from?: string
  to?: string
  q?: string
  source?: string
}

async function getOrders(filters: OrderFilters = {}) {
  try {
    const session = await auth()
    if (!session?.user?.email) return []

    const user = await db.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user?.organizationId) return []

    const where: any = {
      organizationId: user.organizationId,
    }

    if (filters.status && filters.status !== "ALL") {
      where.status = filters.status
    }

    if (filters.from || filters.to) {
      where.createdAt = {}
      if (filters.from) {
        where.createdAt.gte = new Date(filters.from)
      }
      if (filters.to) {
        const toDate = new Date(filters.to)
        toDate.setHours(23, 59, 59, 999)
        where.createdAt.lte = toDate
      }
    }

    if (filters.q) {
      const q = filters.q
      where.OR = [
        { publicOrderCode: { contains: q, mode: "insensitive" } },
        { id: { contains: q } },
        { customer: { name: { contains: q, mode: "insensitive" } } },
        { customer: { email: { contains: q, mode: "insensitive" } } },
        { phoneNumber: { contains: q } },
        { agent: { name: { contains: q, mode: "insensitive" } } },
      ]
    }

    const orders = await db.order.findMany({
      where,
      include: {
        items: {
          include: {
            product: true,
          },
        },
        customer: true,
        agent: true,
        user: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    const orderIds = orders.map((order) => order.id)
    const sourceMap = await getOrderSourceLogMap(orderIds)
    const dispatchMap = await getDispatchMetaByOrderIds(orderIds)
    let enriched = orders.map((order) => ({
      ...order,
      source: resolveOrderSource(order, sourceMap),
      dispatch: dispatchMap.get(order.id) || {
        mode: order.fulfillmentMode === "API" ? "API" as const : "MANUAL" as const,
        provider: order.fulfillmentMode === "API" ? "API" : "Manual",
        network: "",
      },
    }))

    if (filters.source && filters.source !== "ALL") {
      enriched = enriched.filter((order) => order.source === filters.source)
    }

    return enriched
  } catch (error) {
    console.error("Error loading orders", error)
    return []
  }
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const status = typeof searchParams?.status === "string" ? searchParams.status : undefined
  const from = typeof searchParams?.from === "string" ? searchParams.from : undefined
  const to = typeof searchParams?.to === "string" ? searchParams.to : undefined
  const q = typeof searchParams?.q === "string" ? searchParams.q : undefined
  const source = typeof searchParams?.source === "string" ? searchParams.source : undefined

  const filters: OrderFilters = { status, from, to, q, source }

  const ordersRaw = await getOrders(filters)
  const orders = Array.isArray(ordersRaw) ? ordersRaw : []

  const query = new URLSearchParams()
  if (status) query.set("status", status)
  if (from) query.set("from", from)
  if (to) query.set("to", to)
  if (q) query.set("q", q)
  if (source) query.set("source", source)
  query.set("format", "csv")
  const downloadUrl = `/api/orders?${query.toString()}`
  const hasFilters = Boolean(status || from || to || q || source)
  const apiOrders = orders.filter((order) => order.source === "API")
  const sourceCounts = orders.reduce<Record<OrderSource, number>>(
    (acc, order) => {
      acc[order.source] += 1
      return acc
    },
    { API: 0, STOREFRONT: 0, AGENT: 0, RESELLER: 0, DASHBOARD: 0 },
  )
  const apiRevenue = apiOrders.reduce((sum, order) => sum + order.total, 0)
  const apiPending = apiOrders.filter((order) => ["PENDING", "PROCESSING"].includes(order.status)).length
  const filteredRevenue = orders.reduce((sum, order) => sum + order.total, 0)
  const filteredProfit = orders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.profit, 0), 0)
  const pendingWork = orders.filter((order) => ["PENDING", "PROCESSING"].includes(order.status)).length
  const completedVisible = orders.filter((order) => order.status === "COMPLETED").length
  const workspaceRows: DashboardOrderRow[] = orders.map((order) => {
    const bundle = order.items
      .map((item) => item.product.name.match(/\b\d+(?:\.\d+)?\s?(?:GB|MB|KB|TB)\b/i)?.[0].replace(/\s+/g, "").toUpperCase() ?? item.product.name)
      .join(", ")
    const profit = order.items.reduce((sum, item) => sum + item.profit, 0)
    const fulfillmentMode = order.dispatch.mode || order.fulfillmentMode || "MANUAL"

    return {
      id: order.id,
      publicOrderCode: order.publicOrderCode || order.id.slice(-8),
      createdAt: order.createdAt.toISOString(),
      buyerName: order.customer?.name || "Guest Customer",
      phoneNumber: order.phoneNumber || "",
      bundle,
      network: order.dispatch.network || "",
      sourceLabel: ORDER_SOURCE_LABELS[order.source],
      sellerRole: order.sellerRole || "SUBSCRIBER",
      sellerName: order.agent?.name || order.user?.name || "Direct",
      provider: order.dispatch.provider || (fulfillmentMode === "API" ? "API" : "Manual"),
      paymentOwner: order.paymentOwner,
      paymentStatus: order.paymentStatus,
      fulfillmentMode,
      status: order.status,
      total: order.total,
      profit,
      actionable: order.paymentStatus === "PAID"
        && fulfillmentMode === "MANUAL"
        && ["PENDING", "PROCESSING"].includes(order.status),
    }
  })

  return (
    <div className="portal-page flex-1 space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">Orders</h2>
          <p className="text-muted-foreground max-w-xl">
            Track and manage all customer orders. View order status, buyer, and revenue at a glance.
          </p>
        </div>
        <div className="grid w-full min-w-0 gap-2 sm:grid-cols-2 lg:w-auto">
          <a href={downloadUrl}>
            <Button variant="outline" className="w-full justify-center whitespace-nowrap lg:w-auto">
              <Download className="mr-2 h-4 w-4" />
              Download CSV
            </Button>
          </a>
          <a href="/api/dashboard/orders/manual/export">
            <Button variant="outline" className="w-full justify-center whitespace-nowrap lg:w-auto">
              <Download className="mr-2 h-4 w-4" />
              Export Work CSV
            </Button>
          </a>
        </div>
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <MetricCard
          label="Visible Orders"
          value={orders.length}
          description={hasFilters ? "Matching the active filters" : "All tenant orders"}
          icon={ListFilter}
          tone="primary"
        />
        <MetricCard
          label="Visible Revenue"
          value={formatGhanaCedis(filteredRevenue)}
          description="Gross value in the current view"
          icon={ShoppingCart}
          tone="success"
        />
        <MetricCard
          label="Visible Profit"
          value={formatGhanaCedis(filteredProfit)}
          description="Withdrawable/customer-sale profit only"
          icon={Activity}
          tone={filteredProfit > 0 ? "primary" : "info"}
        />
        <MetricCard
          label="Pending Work"
          value={pendingWork}
          description="Pending and processing orders"
          icon={Clock}
          tone={pendingWork > 0 ? "warning" : "success"}
        />
        <MetricCard
          label="Completed"
          value={completedVisible}
          description="Delivered orders in this view"
          icon={CheckCircle2}
          tone="info"
        />
      </div>

      <Card className="min-w-0 max-w-full overflow-hidden border border-border bg-card/95 shadow-sm">
        <CardContent className="grid min-w-0 gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div>
            <p className="text-sm font-semibold text-foreground">Channel mix</p>
            <p className="mt-1 text-xs text-muted-foreground">
              API {sourceCounts.API} / Storefront {sourceCounts.STOREFRONT} / Agent {sourceCounts.AGENT} / Reseller {sourceCounts.RESELLER} / Dashboard {sourceCounts.DASHBOARD}
            </p>
          </div>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:justify-end">
            <Badge variant="outline" className="min-w-0 justify-center px-3 py-1">
              <Activity className="mr-1.5 h-3.5 w-3.5" />
              API: {apiOrders.length} ({formatGhanaCedis(apiRevenue)})
            </Badge>
            <Badge variant={apiPending > 0 ? "secondary" : "outline"} className="justify-center px-3 py-1">
              API pending: {apiPending}
            </Badge>
          </div>
        </CardContent>
      </Card>
      <Card className="min-w-0 max-w-full overflow-hidden border border-border bg-card/95 shadow-sm">
        <CardHeader className="min-w-0 max-w-full overflow-hidden">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <CardTitle>Orders Workspace</CardTitle>
                <p className="text-muted-foreground text-sm">
                  Filter, inspect, pick, copy, claim, deliver, or fail eligible orders from one place.
                </p>
              </div>
              <form className="grid w-full min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-[auto_auto_auto_minmax(14rem,1fr)_auto_auto] 2xl:items-end" method="GET">
              {status ? <input type="hidden" name="status" value={status} /> : null}
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-1">From</span>
                <Input type="date" name="from" defaultValue={from} className="h-9 w-full" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-1">To</span>
                <Input type="date" name="to" defaultValue={to} className="h-9 w-full" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-1">Source</span>
                <select
                  name="source"
                  defaultValue={source || "ALL"}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                >
                  <option value="ALL">All sources</option>
                  <option value="API">API</option>
                  <option value="STOREFRONT">Storefront</option>
                  <option value="AGENT">Agent</option>
                  <option value="RESELLER">Reseller</option>
                  <option value="DASHBOARD">Dashboard</option>
                </select>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-1">Search</span>
                <Input
                  type="text"
                  name="q"
                  placeholder="Name, email, phone"
                  defaultValue={q}
                  className="h-9 w-full"
                />
              </div>
              <Button type="submit" className="h-9 w-full">
                Apply
              </Button>
              <Button asChild type="button" variant="outline" className="h-9 w-full">
                <a href="/dashboard/orders">Reset</a>
              </Button>
              </form>
            </div>
            <OrdersStatusTabs currentStatus={status} />
          </div>
        </CardHeader>
        <CardContent className="max-w-full overflow-hidden p-3 sm:p-6">
          {orders.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title={hasFilters ? "No orders match these filters" : "No orders yet"}
              description={
                hasFilters
                  ? "Adjust the status, date range, or search term to widen the order list."
                  : "Orders will appear here after customers buy from your storefront, agents sell, or internal VTU orders are placed."
              }
              action={hasFilters ? { label: "Reset Filters", href: "/dashboard/orders" } : { label: "Open Storefront Setup", href: "/dashboard/setup" }}
              secondaryAction={hasFilters ? undefined : { label: "Manage Products", href: "/dashboard/products" }}
            />
          ) : (
            <DashboardOrdersWorkspace rows={workspaceRows} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
