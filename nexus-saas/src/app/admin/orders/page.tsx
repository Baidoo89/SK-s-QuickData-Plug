import { auth } from "@/auth"
import Link from "next/link"
import { db } from "@/lib/db"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { OrderTimelineDialog } from "@/components/orders/order-timeline-dialog"
import { formatGhanaCedis } from "@/lib/currency"
import { getDispatchMetaByOrderIds } from "@/lib/admin-order-dispatch"
import { resolveOrderRecipientPhone } from "@/lib/order-recipient"

type OrderFilters = {
  status?: string
  from?: string
  to?: string
  q?: string
  dispatch?: string
  network?: string
}

type AdminOrderItemRow = {
  id: string
  quantity: number
  product: {
    name: string
  }
}

async function getAdminOrders(filters: OrderFilters = {}) {
  try {
    const session = await auth()
    if (!session?.user) return []

    const role = (session.user as any).role
    if (role !== "SUPERADMIN") return []

    const where: any = {}

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
        { organization: { name: { contains: q, mode: "insensitive" } } },
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
        organization: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 200,
    })

    const dispatchByOrderId = await getDispatchMetaByOrderIds(orders.map((o) => o.id))

    let mapped = orders.map((order) => ({
      ...order,
      dispatch: dispatchByOrderId.get(order.id) || { mode: "MANUAL" as const },
    }))

    if (filters.dispatch && filters.dispatch !== "ALL") {
      mapped = mapped.filter((o) => (o.dispatch?.mode || "MANUAL") === filters.dispatch)
    }

    if (filters.network && filters.network !== "ALL") {
      mapped = mapped.filter((o) => (o.dispatch?.network || "") === filters.network)
    }

    return mapped
  } catch (error) {
    console.error("Error loading admin orders", error)
    return []
  }
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const status = typeof searchParams?.status === "string" ? searchParams.status : undefined
  const from = typeof searchParams?.from === "string" ? searchParams.from : undefined
  const to = typeof searchParams?.to === "string" ? searchParams.to : undefined
  const q = typeof searchParams?.q === "string" ? searchParams.q : undefined
  const dispatch = typeof searchParams?.dispatch === "string" ? searchParams.dispatch : undefined
  const network = typeof searchParams?.network === "string" ? searchParams.network : undefined

  const filters: OrderFilters = { status, from, to, q, dispatch, network }

  const ordersRaw = await getAdminOrders(filters)
  const orders = Array.isArray(ordersRaw) ? ordersRaw : []

  function statusBadgeClass(orderStatus: string) {
    if (orderStatus === "COMPLETED") return "status-success border"
    if (orderStatus === "PENDING" || orderStatus === "PROCESSING") return "status-warning border"
    if (orderStatus === "FAILED" || orderStatus === "PAYMENT_FAILED") return ""
    return "status-info border"
  }

  return (
    <div className="portal-page space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Read-only audit</p>
          <h2 className="mb-1 text-2xl font-bold tracking-tight md:text-3xl">Order Activity</h2>
          <p className="text-muted-foreground max-w-xl">
            Platform-wide visibility into tenant order flow. Subscriber admins handle fulfillment status changes from their own dashboard.
          </p>
        </div>
        <div className="grid w-full gap-2 sm:grid-cols-2 md:w-auto">
          <Link href="/admin/orders?dispatch=MANUAL">
            <Button variant="outline" className="w-full text-xs">Manual Dispatch</Button>
          </Link>
          <Link href="/admin/orders?dispatch=API">
            <Button variant="outline" className="w-full text-xs">API Dispatch</Button>
          </Link>
        </div>
      </div>

      <div className="status-info rounded-md border px-4 py-3 text-sm">
        Superadmin order pages are intentionally read-only. Use them to audit tenant activity, spot risk, and verify queue health without operating tenant orders directly.
      </div>

      <Card className="premium-surface overflow-hidden rounded-lg">
        <CardHeader className="border-b border-border/70 bg-muted/20">
          <div className="flex flex-col gap-4">
            <div>
              <CardTitle className="text-lg md:text-xl font-bold">Order Audit</CardTitle>
              <p className="text-muted-foreground text-xs md:text-sm">
                Filter by status, date range, organization, or search term.
              </p>
            </div>
            <form className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-[auto_auto_minmax(12rem,1fr)_auto_auto_auto_auto]" method="GET">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-1">Status</span>
                <select
                  name="status"
                  defaultValue={status || "ALL"}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs md:text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="ALL">All</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="PENDING">Pending</option>
                  <option value="PENDING_PAYMENT">Awaiting Payment</option>
                  <option value="PAYMENT_FAILED">Payment Failed</option>
                  <option value="FAILED">Failed</option>
                </select>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-1">From</span>
                <Input type="date" name="from" defaultValue={from} className="h-9 w-full text-xs md:text-sm" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-1">To</span>
                <Input type="date" name="to" defaultValue={to} className="h-9 w-full text-xs md:text-sm" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-1">Search</span>
                <Input
                  type="text"
                  name="q"
                  placeholder="Org, name, email, phone, agent"
                  defaultValue={q}
                  className="h-9 w-full text-xs md:text-sm"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-1">Dispatch</span>
                <select
                  name="dispatch"
                  defaultValue={dispatch || "ALL"}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs md:text-sm"
                >
                  <option value="ALL">All</option>
                  <option value="API">API</option>
                  <option value="MANUAL">Manual</option>
                </select>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-1">Network</span>
                <select
                  name="network"
                  defaultValue={network || "ALL"}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs md:text-sm"
                >
                  <option value="ALL">All</option>
                  <option value="MTN">MTN</option>
                  <option value="AIRTELTIGO">AirtelTigo</option>
                  <option value="TELECEL">Telecel</option>
                </select>
              </div>
              <Button type="submit" className="h-9 w-full md:w-auto text-xs md:text-sm bg-primary text-white">
                Apply
              </Button>
              <Button asChild type="button" variant="outline" className="h-9 w-full md:w-auto text-xs md:text-sm">
                <a href="/admin/orders">Reset</a>
              </Button>
            </form>
          </div>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No orders found.</p>
          ) : (
            <div className="space-y-2">
              <div className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Orders table
              </div>
              <div className="grid gap-3 xl:hidden lg:grid-cols-2">
                {orders.map((order) => {
                  const buyerName = order.customer?.name || "Guest Customer"
                  const recipientPhone = resolveOrderRecipientPhone(order)
                  const orgName = order.organization?.name || "-"
                  const itemLabel = order.items
                    .map((item: AdminOrderItemRow) => item.product.name.match(/\b\d+(?:\.\d+)?\s?(?:GB|MB|KB|TB)\b/i)?.[0].replace(/\s+/g, "").toUpperCase() ?? item.product.name)
                    .join(", ")
                  return (
                    <div key={order.id} className="rounded-lg border border-border/70 bg-background/80 p-3 text-sm shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-semibold">{order.publicOrderCode || order.id.slice(-8)}</p>
                          <p className="truncate font-medium">{orgName}</p>
                          <p className="text-xs text-muted-foreground">{format(order.createdAt, "MMM d, yyyy")}</p>
                        </div>
                        <Badge
                          variant={order.status === "COMPLETED" ? "secondary" : order.status === "FAILED" ? "destructive" : "outline"}
                          className={statusBadgeClass(order.status)}
                        >
                          {order.status}
                        </Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div>
                          <p className="truncate font-medium text-foreground">{buyerName}</p>
                          <p>Buyer</p>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{recipientPhone || "N/A"}</p>
                          <p>Phone</p>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{order.dispatch?.network || "-"}</p>
                          <p>Network</p>
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">{formatGhanaCedis(order.total)}</p>
                          <p>Total</p>
                        </div>
                      </div>
                      {itemLabel ? <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{itemLabel}</p> : null}
                      <div className="mt-3">
                        <OrderTimelineDialog orderId={order.id} endpointBase="/api/admin/orders" />
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="ops-table-surface table-scroll hidden rounded-lg xl:block">
          <Table className="min-w-[860px] text-xs md:text-sm">
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Network</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Timeline</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const buyerName = order.customer?.name || "Guest Customer"
                const recipientPhone = resolveOrderRecipientPhone(order)
                const agentTag = order.agent ? ` (Agent: ${order.agent.name})` : ""
                const orgName = order.organization?.name || "-"
                return (
                  <TableRow key={order.id} className="hover:bg-muted/20">
                    <TableCell className="font-mono font-medium">{order.publicOrderCode || order.id.slice(-8)}</TableCell>
                    <TableCell>{format(order.createdAt, "MMM d, yyyy")}</TableCell>
                    <TableCell>{orgName}</TableCell>
                    <TableCell>
                      {buyerName}
                      {agentTag && (
                        <span className="text-xs text-muted-foreground">{agentTag}</span>
                      )}
                    </TableCell>
                    <TableCell>{recipientPhone || "N/A"}</TableCell>
                    <TableCell>{order.dispatch?.network || "-"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={order.status === "COMPLETED" ? "secondary" : order.status === "FAILED" ? "destructive" : "outline"}
                        className={statusBadgeClass(order.status)}
                      >
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <OrderTimelineDialog orderId={order.id} endpointBase="/api/admin/orders" />
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {formatGhanaCedis(order.total)}
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
