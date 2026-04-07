import Link from "next/link"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { getDispatchMetaByOrderIds } from "@/lib/admin-order-dispatch"
import { format } from "date-fns"
import { formatGhanaCedis } from "@/lib/currency"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { OrderStatusSelect } from "@/components/admin/order-status-select"
import { ManualResultsImport } from "@/components/admin/manual-results-import"

type Filters = {
  network?: string
}

async function getManualPendingOrders(filters: Filters = {}) {
  const session = await auth()
  if (!session?.user) return []

  const role = (session.user as any).role
  if (role !== "SUBSCRIBER" && role !== "SUPERADMIN") return []

  const orders = await db.order.findMany({
    where: { status: "PENDING" },
    include: {
      items: { include: { product: true } },
      organization: true,
      customer: true,
      agent: true,
    },
    orderBy: { createdAt: "desc" },
    take: 400,
  })

  const dispatchMap = await getDispatchMetaByOrderIds(orders.map((o) => o.id))

  let rows = orders
    .map((order) => ({
      ...order,
      dispatch: dispatchMap.get(order.id) || { mode: "MANUAL" as const },
    }))
    .filter((o) => (o.dispatch.mode || "MANUAL") === "MANUAL")

  if (filters.network && filters.network !== "ALL") {
    rows = rows.filter((r) => (r.dispatch.network || "") === filters.network)
  }

  return rows
}

export default async function AdminManualQueuePage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const network = typeof searchParams?.network === "string" ? searchParams.network : undefined
  const rows = await getManualPendingOrders({ network })

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">Manual Queue</h2>
          <p className="text-muted-foreground max-w-2xl">
            Pending orders routed to manual processing. Export and assign these to provider channels outside API.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/api/admin/orders/manual/export">
            <Button variant="outline" className="text-xs">Export CSV</Button>
          </Link>
          <Link href="/admin/orders">
            <Button className="text-xs">Back to All Orders</Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Manual Pending Orders ({rows.length})</CardTitle>
          <form method="GET" className="flex gap-2">
            <select
              name="network"
              defaultValue={network || "ALL"}
              className="h-9 rounded-md border border-input bg-background px-3 text-xs"
            >
              <option value="ALL">All networks</option>
              <option value="MTN">MTN</option>
              <option value="AIRTELTIGO">AirtelTigo</option>
              <option value="TELECEL">Telecel</option>
            </select>
            <Button type="submit" variant="outline" className="text-xs">Apply</Button>
          </form>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Orders table
            </div>
            <div className="w-full max-w-full overflow-x-auto rounded-md border bg-background">
          <Table className="min-w-[980px] text-xs">
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Org</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Network</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((order) => (
                <TableRow key={order.id} className="hover:bg-muted/20">
                  <TableCell className="font-medium">{order.id.slice(-8)}</TableCell>
                  <TableCell>{format(order.createdAt, "MMM d, yyyy HH:mm")}</TableCell>
                  <TableCell>{order.organization?.name || "-"}</TableCell>
                  <TableCell>
                    {order.customer?.name || "Guest"}
                    {order.agent ? <span className="text-muted-foreground"> (Agent: {order.agent.name})</span> : null}
                  </TableCell>
                  <TableCell>{order.phoneNumber || "N/A"}</TableCell>
                  <TableCell>{order.dispatch.network || "-"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{order.dispatch.provider || "Manual Queue"}</Badge>
                  </TableCell>
                  <TableCell>
                    <OrderStatusSelect orderId={order.id} initialStatus={order.status} />
                  </TableCell>
                  <TableCell>
                    {order.items.map((item) => (
                      <div key={item.id} className="text-muted-foreground">
                        {item.product.name.match(/\b\d+(?:\.\d+)?\s?(?:GB|MB|KB|TB)\b/i)?.[0].replace(/\s+/g, "").toUpperCase() ?? item.product.name}
                      </div>
                    ))}
                  </TableCell>
                  <TableCell className="text-right font-semibold">{formatGhanaCedis(order.total)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground">
                    No manual pending orders found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      <ManualResultsImport />
    </div>
  )
}
