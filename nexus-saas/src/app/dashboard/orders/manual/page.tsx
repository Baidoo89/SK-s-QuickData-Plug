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
  if (!session?.user?.email) return []

  const actor = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true, organizationId: true },
  })

  if (!actor?.organizationId) return []

  // Dashboard portal is for SUBSCRIBER admins; keep scope tenant-safe.
  if (actor.role !== "SUBSCRIBER" && actor.role !== "SUPERADMIN") return []

  const orders = await db.order.findMany({
    where: {
      status: "PENDING",
      ...(actor.role === "SUPERADMIN" ? {} : { organizationId: actor.organizationId }),
    },
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

export default async function DashboardManualQueuePage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const network = typeof searchParams?.network === "string" ? searchParams.network : "ALL"
  const rows = await getManualPendingOrders({ network })

  const exportParams = new URLSearchParams()
  if (network && network !== "ALL") {
    exportParams.set("network", network)
  }

  const exportHref = exportParams.toString()
    ? `/api/dashboard/orders/manual/export?${exportParams.toString()}`
    : "/api/dashboard/orders/manual/export"

  const claimParams = new URLSearchParams(exportParams)
  claimParams.set("claimPending", "true")
  const claimHref = `/api/dashboard/orders/manual/export?${claimParams.toString()}`

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="mb-1 text-2xl font-bold tracking-tight md:text-3xl">Manual Queue</h2>
          <p className="max-w-2xl text-muted-foreground">
            Pending orders routed to manual processing. Export and process outside API, then import statuses.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Active filter: {network === "ALL" ? "All networks" : network}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={exportHref}>
            <Button variant="outline" className="text-xs">Download Filtered CSV</Button>
          </Link>
          <Link href={claimHref}>
            <Button className="text-xs">Claim + Download Filtered</Button>
          </Link>
          <Link href="/dashboard/orders">
            <Button variant="secondary" className="text-xs">Back to Orders</Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Manual Pending Orders ({rows.length})</CardTitle>
          <form method="GET" className="flex gap-2">
            <select
              name="network"
              defaultValue={network}
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
                      <OrderStatusSelect
                        orderId={order.id}
                        initialStatus={order.status}
                        endpointBase="/api/dashboard/orders"
                      />
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

      <ManualResultsImport importEndpoint="/api/dashboard/orders/manual/import" />
    </div>
  )
}
