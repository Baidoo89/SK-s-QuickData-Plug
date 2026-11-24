import { auth } from "@/auth"
import { db } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { MetricCard } from "@/components/ui/metric-card"
import { PageHeader } from "@/components/ui/page-header"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { OrdersStatusTabs } from "@/components/dashboard/orders-status-tabs"
import { DashboardOrdersWorkspace, type DashboardOrderRow } from "@/components/dashboard/orders-workspace"
import { formatGhanaCedis } from "@/lib/currency"
import { getDispatchMetaByOrderIds } from "@/lib/admin-order-dispatch"
import { getOrderSourceLogMap, ORDER_SOURCE_LABELS, resolveOrderSource } from "@/lib/order-source"
import { resolveOrderRecipientPhone } from "@/lib/order-recipient"
import { getActiveManualOrderSets } from "@/lib/manual-order-sets"
import { Clock, Download, ShoppingCart } from "lucide-react"

type OrderFilters = {
  status?: string
  from?: string
  to?: string
  q?: string
  source?: string
  agentId?: string
  userId?: string
}

async function getOrders(filters: OrderFilters = {}) {
  try {
    const session = await auth()
    if (!session?.user?.email) return { orders: [], organizationId: null as string | null }

    const user = await db.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user?.organizationId) return { orders: [], organizationId: null as string | null }

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
        { customer: { phone: { contains: q } } },
        { phoneNumber: { contains: q } },
        { agent: { name: { contains: q, mode: "insensitive" } } },
      ]
    }

    if (filters.agentId) where.agentId = filters.agentId
    if (filters.userId) where.userId = filters.userId

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

    return { orders: enriched, organizationId: user.organizationId }
  } catch (error) {
    console.error("Error loading orders", error)
    return { orders: [], organizationId: null as string | null }
  }
}

export default async function OrdersPage(
  props: {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
  }
) {
  const searchParams = await props.searchParams;
  const status = typeof searchParams?.status === "string" ? searchParams.status : undefined
  const from = typeof searchParams?.from === "string" ? searchParams.from : undefined
  const to = typeof searchParams?.to === "string" ? searchParams.to : undefined
  const q = typeof searchParams?.q === "string" ? searchParams.q : undefined
  const source = typeof searchParams?.source === "string" ? searchParams.source : undefined
  const agentId = typeof searchParams?.agentId === "string" ? searchParams.agentId : undefined
  const userId = typeof searchParams?.userId === "string" ? searchParams.userId : undefined

  const filters: OrderFilters = { status, from, to, q, source, agentId, userId }

  const orderResult = await getOrders(filters)
  const ordersRaw = orderResult.orders
  const orders = Array.isArray(ordersRaw) ? ordersRaw : []
  const initialClaimedSets = !status || status === "PROCESSING"
    ? await getActiveManualOrderSets({ organizationId: orderResult.organizationId })
    : []

  const query = new URLSearchParams()
  if (status) query.set("status", status)
  if (from) query.set("from", from)
  if (to) query.set("to", to)
  if (q) query.set("q", q)
  if (source) query.set("source", source)
  if (agentId) query.set("agentId", agentId)
  if (userId) query.set("userId", userId)
  query.set("format", "csv")
  const downloadUrl = `/api/orders?${query.toString()}`
  const hasFilters = Boolean(status || from || to || q || source || agentId || userId)
  const filteredRevenue = orders.reduce((sum, order) => sum + order.total, 0)
  const pendingOrders = orders.filter((order) => order.status === "PENDING").length
  const processingOrders = orders.filter((order) => order.status === "PROCESSING").length
  const pendingWork = pendingOrders + processingOrders
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
      phoneNumber: resolveOrderRecipientPhone(order),
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
      <PageHeader
        as="h2"
        title={agentId ? "Agent orders" : userId ? "Reseller orders" : "Orders"}
        description={agentId ? "Orders sold by this agent." : userId ? "Orders placed by this reseller." : "Review and fulfill sales."}
        actions={
          <a href={downloadUrl}>
            <Button variant="outline" className="w-full justify-center whitespace-nowrap lg:w-auto">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </a>
        }
      />
      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4">
        <MetricCard
          label="Orders"
          value={orders.length}
          description={hasFilters ? "Filtered view" : "All orders"}
          icon={ShoppingCart}
          tone="primary"
        />
        <MetricCard
          label="Revenue"
          value={formatGhanaCedis(filteredRevenue)}
          description="Current view"
          icon={ShoppingCart}
          tone="success"
        />
        <MetricCard
          label="To process"
          value={pendingWork}
          description={`${pendingOrders} pending, ${processingOrders} processing`}
          icon={Clock}
          tone={pendingWork > 0 ? "warning" : "success"}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <Card className="premium-surface min-w-0 max-w-full overflow-hidden rounded-lg">
        <CardHeader className="min-w-0 max-w-full overflow-hidden">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <CardTitle>Orders</CardTitle>
                <p className="text-muted-foreground text-sm">
                  Select an order to review or fulfill.
                </p>
              </div>
              <details className="w-full min-w-0 md:max-w-3xl" open={hasFilters}>
              <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Filters{hasFilters ? " · active" : ""}</summary>
              <form className="mt-3 grid w-full min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-[auto_auto_auto_minmax(14rem,1fr)_auto_auto] 2xl:items-end" method="GET">
              {status ? <input type="hidden" name="status" value={status} /> : null}
              {agentId ? <input type="hidden" name="agentId" value={agentId} /> : null}
              {userId ? <input type="hidden" name="userId" value={userId} /> : null}
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
              </details>
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
                  : "Orders will appear here after sales."
              }
              action={hasFilters ? { label: "Reset Filters", href: "/dashboard/orders" } : { label: "Open Storefront Setup", href: "/dashboard/setup" }}
              secondaryAction={hasFilters ? undefined : { label: "Manage Products", href: "/dashboard/products" }}
            />
          ) : (
            <DashboardOrdersWorkspace rows={workspaceRows} initialClaimedSets={initialClaimedSets} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
