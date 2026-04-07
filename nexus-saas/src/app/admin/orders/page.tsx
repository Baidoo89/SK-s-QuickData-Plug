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
import { OrderStatusSelect } from "@/components/admin/order-status-select"
import { RetryDispatchButton } from "@/components/admin/retry-dispatch-button"
import { formatGhanaCedis } from "@/lib/currency"
import { BulkOrderStatusUpdate } from "@/components/admin/bulk-order-status-update"

type OrderFilters = {
  status?: string
  from?: string
  to?: string
  q?: string
  dispatch?: string
  network?: string
}

type DispatchMeta = {
  mode?: "API" | "MANUAL"
  provider?: string
  network?: string
  reason?: string
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
    if (role !== "SUBSCRIBER" && role !== "SUPERADMIN") return []

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
        { customer: { name: { contains: q, mode: "insensitive" } } },
        { customer: { email: { contains: q, mode: "insensitive" } } },
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

    const orderIds = orders.map((o) => o.id)
    const dispatchLogs = orderIds.length
      ? await db.auditLog.findMany({
          where: {
            action: "ORDER_DISPATCH_DECISION",
            targetType: "ORDER",
            targetId: { in: orderIds },
          },
          orderBy: { createdAt: "desc" },
          select: { targetId: true, meta: true },
        })
      : []

    const dispatchByOrderId = new Map<string, DispatchMeta>()
    for (const log of dispatchLogs) {
      if (dispatchByOrderId.has(log.targetId)) continue
      try {
        const parsed = log.meta ? (JSON.parse(log.meta) as DispatchMeta) : {}
        dispatchByOrderId.set(log.targetId, parsed)
      } catch {
        dispatchByOrderId.set(log.targetId, {})
      }
    }

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

  return (
    <div className="flex-1 space-y-6 overflow-x-hidden">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">All Orders</h2>
          <p className="text-muted-foreground max-w-xl">
            Platform-wide view of every order across all subscribers.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/orders/manual">
            <Button variant="outline" className="text-xs">Open Manual Queue</Button>
          </Link>
          <Link href="/api/admin/orders/manual/export">
            <Button variant="outline" className="text-xs">Export Manual CSV</Button>
          </Link>
        </div>
      </div>

      <BulkOrderStatusUpdate />

      <Card className="hover:shadow-lg transition-shadow">
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <CardTitle className="text-lg md:text-xl font-bold text-primary">Recent Orders</CardTitle>
              <p className="text-muted-foreground text-xs md:text-sm">
                Filter by status, date range, organization, or search term.
              </p>
            </div>
            <form className="flex flex-wrap gap-2 md:gap-3 items-end justify-start md:justify-end" method="GET">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-1">Status</span>
                <select
                  name="status"
                  defaultValue={status || "ALL"}
                  className="h-9 rounded-md border border-input bg-background px-3 text-xs md:text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="ALL">All</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="PENDING">Pending</option>
                  <option value="FAILED">Failed</option>
                </select>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-1">From</span>
                <Input type="date" name="from" defaultValue={from} className="h-9 text-xs md:text-sm" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-1">To</span>
                <Input type="date" name="to" defaultValue={to} className="h-9 text-xs md:text-sm" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-1">Search</span>
                <Input
                  type="text"
                  name="q"
                  placeholder="Org, name, email, phone, agent"
                  defaultValue={q}
                  className="h-9 w-32 md:w-48 lg:w-64 text-xs md:text-sm"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-1">Dispatch</span>
                <select
                  name="dispatch"
                  defaultValue={dispatch || "ALL"}
                  className="h-9 rounded-md border border-input bg-background px-3 text-xs md:text-sm"
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
                  className="h-9 rounded-md border border-input bg-background px-3 text-xs md:text-sm"
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
              <div className="w-full max-w-full overflow-x-auto rounded-md border bg-background">
          <Table className="min-w-[900px] text-xs md:text-sm">
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="text-primary">Order ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="hidden sm:table-cell">Organization</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="hidden md:table-cell">Network</TableHead>
                <TableHead className="hidden md:table-cell">Dispatch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Actions</TableHead>
                <TableHead className="hidden sm:table-cell">Items</TableHead>
                <TableHead className="text-right text-primary">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const buyerName = order.customer?.name || "Guest Customer"
                const agentTag = order.agent ? ` (Agent: ${order.agent.name})` : ""
                const orgName = order.organization?.name || "-"
                return (
                  <TableRow key={order.id} className="hover:bg-muted/20">
                    <TableCell className="font-medium">{order.id.slice(-8)}</TableCell>
                    <TableCell>{format(order.createdAt, "MMM d, yyyy")}</TableCell>
                    <TableCell className="hidden sm:table-cell">{orgName}</TableCell>
                    <TableCell>
                      {buyerName}
                      {agentTag && (
                        <span className="text-xs text-muted-foreground">{agentTag}</span>
                      )}
                    </TableCell>
                    <TableCell>{order.phoneNumber || "N/A"}</TableCell>
                    <TableCell className="hidden md:table-cell">{order.dispatch?.network || "-"}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant={(order.dispatch?.mode || "MANUAL") === "API" ? "default" : "secondary"}>
                        {(order.dispatch?.mode || "MANUAL")}
                      </Badge>
                      <div className="text-[11px] text-muted-foreground">{order.dispatch?.provider || "Manual Queue"}</div>
                    </TableCell>
                    <TableCell>
                      <OrderStatusSelect orderId={order.id} initialStatus={order.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {(order.dispatch?.mode || "MANUAL") === "API" && order.status !== "COMPLETED" ? (
                        <RetryDispatchButton orderId={order.id} />
                      ) : (
                        <span className="text-[11px] text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {order.items.map((item: AdminOrderItemRow) => (
                        <div key={item.id} className="text-xs md:text-sm text-muted-foreground">
                          {item.product.name.match(/\b\d+(?:\.\d+)?\s?(?:GB|MB|KB|TB)\b/i)?.[0].replace(/\s+/g, "").toUpperCase() ?? item.product.name}
                        </div>
                      ))}
                    </TableCell>
                    <TableCell className="text-right font-bold text-primary">
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
