import { auth } from "@/auth"
import { db } from "@/lib/db"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { OrderTimelineDialog } from "@/components/orders/order-timeline-dialog"
import { getStorefrontPaymentMap, type OrderPaymentSummary } from "@/lib/storefront-payment-map"
import { PortalAccessMessage } from "@/components/access/portal-access-message"
import { formatGhanaCedis } from "@/lib/currency"
import { Store } from "lucide-react"

type AgentOrderItemRow = {
  quantity: number
  price: number
  profit: number
  product: {
    name: string
  }
}

function formatItemName(name: string) {
  const sizeMatch = name.match(/\b\d+(?:\.\d+)?\s?(?:GB|MB|KB|TB)\b/i)
  if (sizeMatch) {
    return sizeMatch[0].replace(/\s+/g, "").toUpperCase()
  }

  return name
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
}

type AgentOrderRow = {
  id: string
  publicOrderCode: string | null
  createdAt: Date
  customer: {
    name: string | null
    phone: string | null
  } | null
  phoneNumber: string | null
  total: number
  status: string
  items: AgentOrderItemRow[]
  payment?: OrderPaymentSummary
}

type OrderFilters = {
  status?: string
  from?: string
  to?: string
  q?: string
}

function orderStatusBadgeClass(status: string) {
  if (status === "COMPLETED") return "status-success border"
  if (status === "PENDING" || status === "PROCESSING") return "status-warning border"
  if (status === "FAILED" || status === "PAYMENT_FAILED") return ""
  return "status-info border"
}

export default async function AgentOrdersPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const status = typeof searchParams?.status === "string" ? searchParams.status : undefined
  const from = typeof searchParams?.from === "string" ? searchParams.from : undefined
  const to = typeof searchParams?.to === "string" ? searchParams.to : undefined
  const q = typeof searchParams?.q === "string" ? searchParams.q : undefined

  const filters: OrderFilters = { status, from, to, q }
  const hasFilters = Boolean(status || from || to || q)

  const session = await auth()
  if (!session?.user?.email) {
    return <PortalAccessMessage title="Login required" description="Sign in with an approved agent account to view orders." />
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, role: true, agentId: true, organizationId: true },
  })

  if (!user || user.role !== "AGENT" || !user.organizationId) {
    return <PortalAccessMessage title="Agent profile unavailable" description="This account is not linked to an approved agent profile. Ask the subscriber admin to review the account." />
  }

  let agentId = user.agentId
  if (!agentId) {
    const fallbackAgent = await db.agent.findFirst({
      where: {
        organizationId: user.organizationId,
        name: user.name ?? undefined,
      },
      orderBy: { createdAt: "asc" },
    })

    if (fallbackAgent) {
      agentId = fallbackAgent.id
      await db.user.update({ where: { id: user.id }, data: { agentId } })
    }
  }

  if (!agentId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t find an agent profile linked to your account yet. Ask your admin to create an agent record for you.
        </p>
      </div>
    )
  }

  const ownershipFilter = [
    { agentId },
    { userId: user.id },
  ]

  const where: any = {
    organizationId: user.organizationId,
    OR: ownershipFilter,
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
    const search = filters.q
    where.AND = [
      { OR: ownershipFilter },
      {
        OR: [
          { customer: { name: { contains: search, mode: "insensitive" } } },
          { customer: { email: { contains: search, mode: "insensitive" } } },
          { phoneNumber: { contains: search } },
          { publicOrderCode: { contains: search, mode: "insensitive" } },
          { id: { contains: search } },
        ],
      },
    ]
    delete where.OR
  }

  const rawOrders = await db.order.findMany({
    where,
    include: {
      customer: true,
      items: {
        include: {
          product: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  }) as AgentOrderRow[]
  const paymentMap = await getStorefrontPaymentMap(rawOrders.map((order) => order.id), user.organizationId)
  const orders = rawOrders.map((order) => ({
    ...order,
    payment: paymentMap.get(order.id) || { owner: "WALLET" as const, status: "PAID", reference: "Wallet/Internal", amount: order.total, paidAt: null },
  }))

  return (
    <div className="portal-page space-y-6">
      <div className="mx-auto max-w-2xl space-y-1 text-center">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">
          All completed storefront orders that used your agent link will appear here.
        </p>
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div>
              <CardTitle className="text-sm font-semibold">Order history</CardTitle>
              <CardDescription className="text-xs">
                This list is backed by the real orders database. Admin and subscribers can also see these orders in their own views.
              </CardDescription>
            </div>
            <form className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-[auto_auto_auto_minmax(12rem,1fr)_auto_auto] lg:items-end" method="GET">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-1">Status</span>
                <select
                  name="status"
                  defaultValue={status || "ALL"}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                >
                  <option value="ALL">All</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="PENDING">Pending</option>
                  <option value="PROCESSING">Processing</option>
                  <option value="PENDING_PAYMENT">Awaiting Payment</option>
                  <option value="PAYMENT_FAILED">Payment Failed</option>
                  <option value="FAILED">Failed</option>
                </select>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-1">From</span>
                <Input type="date" name="from" defaultValue={from} className="h-9 w-full text-xs" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-1">To</span>
                <Input type="date" name="to" defaultValue={to} className="h-9 w-full text-xs" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-1">Search</span>
                <Input
                  type="text"
                  name="q"
                  placeholder="Name, email, phone"
                  defaultValue={q}
                  className="h-9 w-full text-xs"
                />
              </div>
              <Button type="submit" className="h-9 w-full text-xs md:w-auto">Apply</Button>
              <Button asChild type="button" variant="outline" className="h-9 text-xs">
                <a href="/agent/orders">Reset</a>
              </Button>
            </form>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-hidden">
          {orders.length === 0 && (
            <EmptyState
              icon={Store}
              title={hasFilters ? "No orders match these filters" : "No agent orders yet"}
              description={
                hasFilters
                  ? "Adjust the status, date range, or search term to see more orders."
                  : "Share your storefront link with customers or place a direct VTU order. Successful orders will be listed here."
              }
              action={hasFilters ? { label: "Reset Filters", href: "/agent/orders" } : { label: "Open Storefronts", href: "/agent/storefronts" }}
              secondaryAction={hasFilters ? undefined : { label: "Buy Data", href: "/agent/buy/single" }}
            />
          )}
          {orders.length > 0 && (
            <div className="space-y-2">
              <div className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Orders table
              </div>
              <div className="table-scroll rounded-md border bg-background">
                <Table className="min-w-[720px] text-xs">
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Order ID</TableHead>
                      <TableHead className="whitespace-nowrap">Time</TableHead>
                      <TableHead className="whitespace-nowrap">Customer</TableHead>
                      <TableHead className="whitespace-nowrap">Phone</TableHead>
                      <TableHead className="whitespace-nowrap">Items</TableHead>
                      <TableHead className="whitespace-nowrap">Payment</TableHead>
                      <TableHead className="whitespace-nowrap">Status</TableHead>
                      <TableHead className="whitespace-nowrap">Timeline</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Total (GHS)</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Profit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order: AgentOrderRow) => {
                      const date = new Date(order.createdAt)
                      const customerName = order.customer?.name || "Walk-in customer"
                      const phone = order.phoneNumber || order.customer?.phone || "-"
                      const itemsLabel = order.items
                        .map((item: AgentOrderItemRow) => formatItemName(item.product.name))
                        .join(" | ")
                      const profit = order.items.reduce((sum, item) => sum + item.profit, 0)

                      return (
                        <TableRow key={order.id} className="hover:bg-muted/20">
                          <TableCell className="whitespace-nowrap font-mono text-xs font-medium">{order.publicOrderCode || order.id.slice(-8)}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{date.toLocaleString()}</TableCell>
                          <TableCell className="text-xs font-medium">
                            {customerName}
                            <div className="text-[11px] text-muted-foreground">
                              {order.customer?.name ? "Registered customer" : "Guest checkout"}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{phone}</TableCell>
                          <TableCell className="max-w-[260px] text-xs">
                            <span className="line-clamp-2 break-words">{itemsLabel}</span>
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="space-y-1">
                              <Badge variant="outline" className={order.payment?.owner === "STOREFRONT" ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"}>
                                {order.payment?.owner === "STOREFRONT" ? order.payment.status : "WALLET"}
                              </Badge>
                              <div className="max-w-[120px] truncate font-mono text-[10px] text-muted-foreground">
                                {order.payment?.reference}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                              <Badge
                                variant={
                                  order.status === "COMPLETED"
                                  ? "secondary"
                                  : order.status === "PENDING" || order.status === "PROCESSING"
                                  ? "outline"
                                  : order.status === "FAILED"
                                  ? "destructive"
                                  : "outline"
                                }
                                className={orderStatusBadgeClass(order.status)}
                            >
                              {order.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <OrderTimelineDialog orderId={order.id} endpointBase="/api/agent/orders" />
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right text-xs font-semibold">{formatGhanaCedis(order.total)}</TableCell>
                          <TableCell className={profit > 0 ? "whitespace-nowrap text-right text-xs font-semibold text-primary" : "whitespace-nowrap text-right text-xs text-muted-foreground"}>
                            {formatGhanaCedis(profit)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

