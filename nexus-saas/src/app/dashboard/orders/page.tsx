import { auth } from "@/auth"
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
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { OrdersStatusTabs } from "@/components/dashboard/orders-status-tabs"
import { OrderStatusSelect } from "@/components/admin/order-status-select"
import { format } from "date-fns"
import { formatGhanaCedis } from "@/lib/currency"

type OrderFilters = {
  status?: string
  from?: string
  to?: string
  q?: string
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
        { customer: { name: { contains: q, mode: "insensitive" } } },
        { customer: { email: { contains: q, mode: "insensitive" } } },
        { phoneNumber: { contains: q } },
        { agent: { name: { contains: q, mode: "insensitive" } } },
      ]
    }

    return db.order.findMany({
      where,
      include: {
        items: {
          include: {
            product: true,
          },
        },
        customer: true,
        agent: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })
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

  const filters: OrderFilters = { status, from, to, q }

  const ordersRaw = await getOrders(filters)
  const orders = Array.isArray(ordersRaw) ? ordersRaw : []

  const query = new URLSearchParams()
  if (status) query.set("status", status)
  if (from) query.set("from", from)
  if (to) query.set("to", to)
  if (q) query.set("q", q)
  query.set("format", "csv")
  const downloadUrl = `/api/orders?${query.toString()}`

  return (
    <div className="flex-1 space-y-6 overflow-x-hidden px-4 py-6 md:p-8 md:pt-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">Orders</h2>
          <p className="text-muted-foreground max-w-xl">
            Track and manage all customer orders. View order status, buyer, and revenue at a glance.
          </p>
        </div>
        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-3">
          <a href={downloadUrl}>
            <Button variant="outline" className="w-full justify-center md:w-auto">
              Download CSV
            </Button>
          </a>
          <a href="/api/dashboard/orders/manual/export">
            <Button variant="outline" className="w-full justify-center md:w-auto">
              Export Manual CSV
            </Button>
          </a>
          <a href="/dashboard/orders/manual">
            <Button variant="outline" className="w-full justify-center md:w-auto">
              Open Manual Queue
            </Button>
          </a>
        </div>
      </div>
      <Card className="hover:shadow-lg transition-shadow">
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <CardTitle>Recent Orders</CardTitle>
                <p className="text-muted-foreground text-sm">
                  Filter orders by status, date range, or search term. Use the download button to export the current view.
                </p>
              </div>
              <form className="flex flex-wrap gap-3 items-end justify-start md:justify-end" method="GET">
              {status ? <input type="hidden" name="status" value={status} /> : null}
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-1">From</span>
                <Input type="date" name="from" defaultValue={from} className="h-9" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-1">To</span>
                <Input type="date" name="to" defaultValue={to} className="h-9" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground mb-1">Search</span>
                <Input
                  type="text"
                  name="q"
                  placeholder="Name, email, phone"
                  defaultValue={q}
                  className="h-9 w-44 md:w-52"
                />
              </div>
              <Button type="submit" className="h-9 w-full md:w-auto">
                Apply
              </Button>
              <Button asChild type="button" variant="outline" className="h-9 w-full md:w-auto">
                <a href="/dashboard/orders">Reset</a>
              </Button>
              </form>
            </div>
            <OrdersStatusTabs currentStatus={status} />
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
                <Table className="min-w-[720px] text-sm">
                  <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => {
                      const buyerName = order.customer?.name || "Guest Customer"
                      const agentTag = order.agent ? ` (Agent: ${order.agent.name})` : ""
                      return (
                        <TableRow key={order.id} className="hover:bg-muted/20">
                          <TableCell className="font-medium">{order.id.slice(-8)}</TableCell>
                          <TableCell>{format(order.createdAt, "MMM d, yyyy")}</TableCell>
                          <TableCell>
                            {buyerName}
                            {agentTag && (
                              <span className="text-xs text-muted-foreground">{agentTag}</span>
                            )}
                          </TableCell>
                          <TableCell>{order.phoneNumber || "N/A"}</TableCell>
                          <TableCell>
                            <OrderStatusSelect
                              orderId={order.id}
                              initialStatus={order.status}
                              endpointBase="/api/dashboard/orders"
                            />
                          </TableCell>
                          <TableCell>
                            {order.items.map((item) => (
                              <div key={item.id} className="text-sm text-muted-foreground">
                                {item.product.name.match(/\b\d+(?:\.\d+)?\s?(?:GB|MB|KB|TB)\b/i)?.[0].replace(/\s+/g, "").toUpperCase() ?? item.product.name}
                              </div>
                            ))}
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
