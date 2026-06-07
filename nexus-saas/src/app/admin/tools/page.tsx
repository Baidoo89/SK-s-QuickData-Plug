import { AlertTriangle, Building2, PackageX } from "lucide-react"

import { db } from "@/lib/db"
import { formatGhanaCedis } from "@/lib/currency"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MetricCard } from "@/components/ui/metric-card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export const dynamic = "force-dynamic"

type OrganizationRow = {
  id: string
  name: string
  slug: string
  active: boolean
  subscription: { status: string } | null
  _count: { products: number; users: number }
}

type ProductRow = {
  id: string
  name: string
  category: string | null
  provider: string | null
  organization: { name: string } | null
}

type PendingOrderRow = {
  id: string
  total: number
  createdAt: Date
  phoneNumber: string | null
  organization: { name: string } | null
}

export default async function AdminToolsPage() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [tenantGaps, zeroStockProducts, pendingOrders] = await Promise.all([
    db.organization.findMany({
      where: {
        OR: [
          { active: false },
          { subscription: null },
          { products: { none: {} } },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        active: true,
        subscription: { select: { status: true } },
        _count: { select: { products: true, users: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    db.product.findMany({
      where: { stock: 0, active: true },
      select: { id: true, name: true, category: true, provider: true, organization: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    db.order.findMany({
      where: { status: "PENDING", createdAt: { lte: thirtyDaysAgo } },
      select: {
        id: true,
        total: true,
        createdAt: true,
        phoneNumber: true,
        organization: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 20,
    }),
  ]) as [OrganizationRow[], ProductRow[], PendingOrderRow[]]

  return (
    <div className="portal-page space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Diagnostics</p>
        <h2 className="text-2xl font-bold tracking-tight">Platform Diagnostics</h2>
        <p className="text-sm text-muted-foreground">
          Read-only checks for launch gaps, product readiness, and stale tenant operations that need follow-up.
        </p>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-3">
        <MetricCard label="Tenant Launch Gaps" value={tenantGaps.length} description="Inactive, unsubscribed, or empty product catalogs." icon={Building2} tone={tenantGaps.length > 0 ? "warning" : "success"} />
        <MetricCard label="Zero Stock" value={zeroStockProducts.length} description="Active products needing review" icon={PackageX} tone={zeroStockProducts.length > 0 ? "warning" : "success"} />
        <MetricCard label="Stale Pending" value={pendingOrders.length} description="Pending orders older than 30 days" icon={AlertTriangle} tone={pendingOrders.length > 0 ? "destructive" : "success"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Tenant Launch Gaps
            <Badge variant={tenantGaps.length > 0 ? "outline" : "secondary"}>{tenantGaps.length}</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Tenants that may need Superadmin follow-up before they can sell reliably.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid gap-3 p-4 xl:hidden lg:grid-cols-2">
            {tenantGaps.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No tenant launch gaps found.</p>
            ) : (
              tenantGaps.map((org) => {
                const signals = [
                  !org.active ? "Suspended" : null,
                  !org.subscription ? "No subscription" : null,
                  org.subscription && org.subscription.status !== "ACTIVE" ? org.subscription.status : null,
                  org._count.products === 0 ? "No products" : null,
                  org._count.users === 0 ? "No users" : null,
                ].filter((signal): signal is string => Boolean(signal))

                return (
                  <div key={org.id} className="rounded-lg border border-border/70 bg-background/80 p-3 text-sm shadow-sm">
                    <p className="truncate font-semibold">{org.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">/{org.slug}</p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {signals.map((signal) => (
                        <Badge key={signal} variant="outline" className="text-[10px]">
                          {signal}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <div className="table-scroll hidden xl:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Signals</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenantGaps.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                      No tenant launch gaps found.
                    </TableCell>
                  </TableRow>
                ) : (
                  tenantGaps.map((org) => {
                    const signals = [
                      !org.active ? "Suspended" : null,
                      !org.subscription ? "No subscription" : null,
                      org.subscription && org.subscription.status !== "ACTIVE" ? org.subscription.status : null,
                      org._count.products === 0 ? "No products" : null,
                      org._count.users === 0 ? "No users" : null,
                    ].filter((signal): signal is string => Boolean(signal))

                    return (
                      <TableRow key={org.id}>
                        <TableCell className="font-medium">{org.name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">/{org.slug}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {signals.map((signal) => (
                              <Badge key={signal} variant="outline" className="text-[10px]">
                                {signal}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Active Products With Zero Stock
            <Badge variant={zeroStockProducts.length > 0 ? "outline" : "secondary"}>{zeroStockProducts.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid gap-3 p-4 xl:hidden lg:grid-cols-2">
            {zeroStockProducts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No zero-stock active products.</p>
            ) : (
              zeroStockProducts.map((product) => (
                <div key={product.id} className="rounded-lg border border-border/70 bg-background/80 p-3 text-sm shadow-sm">
                  <p className="font-semibold">{product.name}</p>
                  <p className="text-xs text-muted-foreground">{product.organization?.name ?? "-"}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-[10px]">{product.category?.replace(/_/g, " ") ?? "Uncategorized"}</Badge>
                    <Badge variant="outline" className="text-[10px]">{product.provider ?? "No provider"}</Badge>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="table-scroll hidden xl:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Organization</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zeroStockProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                      No zero-stock active products.
                    </TableCell>
                  </TableRow>
                ) : (
                  zeroStockProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell className="text-xs">{product.category?.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-xs">{product.provider ?? "-"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{product.organization?.name ?? "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Pending Orders Older Than 30 Days
            <Badge variant={pendingOrders.length > 0 ? "destructive" : "secondary"}>{pendingOrders.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid gap-3 p-4 xl:hidden lg:grid-cols-2">
            {pendingOrders.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No stale pending orders.</p>
            ) : (
              pendingOrders.map((order) => (
                <div key={order.id} className="rounded-lg border border-border/70 bg-background/80 p-3 text-sm shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold">#{order.id.slice(0, 10)}</p>
                      <p className="truncate text-xs text-muted-foreground">{order.organization?.name ?? "-"}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">Older than 30 days</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <p className="font-medium text-foreground">{order.phoneNumber ?? "-"}</p>
                      <p>Phone</p>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{formatGhanaCedis(order.total)}</p>
                      <p>Total</p>
                    </div>
                    <div className="col-span-2">
                      <p className="font-medium text-foreground">{new Date(order.createdAt).toLocaleDateString()}</p>
                      <p>Created</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="table-scroll hidden xl:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                      No stale pending orders.
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-xs">{order.id.slice(0, 10)}...</TableCell>
                      <TableCell className="text-sm">{order.phoneNumber ?? "-"}</TableCell>
                      <TableCell className="text-sm">{formatGhanaCedis(order.total)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{order.organization?.name ?? "-"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
