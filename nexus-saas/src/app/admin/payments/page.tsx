import Link from "next/link"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { formatGhanaCedis } from "@/lib/currency"
import { format } from "date-fns"
import { CheckCircle2, CircleDollarSign, Clock3, XCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/ui/empty-state"
import { MetricCard } from "@/components/ui/metric-card"

function parseOrderIds(value: string) {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}

function paymentBadgeClass(status: string) {
  if (status === "SUCCESS") return "status-success border"
  if (status === "PENDING") return "status-warning border"
  return "border-destructive/50 bg-destructive/10 text-destructive"
}

async function getAdminStorefrontPayments() {
  const session = await auth()
  if ((session?.user as any)?.role !== "SUPERADMIN") {
    return { payments: [], orgById: new Map<string, string>(), totals: { success: 0, pending: 0, failed: 0, revenue: 0 } }
  }

  const payments = await db.storefrontPayment.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
  })

  const organizationIds = Array.from(new Set(payments.map((payment) => payment.organizationId)))
  const organizations = organizationIds.length
    ? await db.organization.findMany({
        where: { id: { in: organizationIds } },
        select: { id: true, name: true, slug: true },
      })
    : []

  const orgById = new Map(organizations.map((organization) => [organization.id, `${organization.name} (${organization.slug})`]))
  const totals = payments.reduce(
    (acc, payment) => {
      if (payment.status === "SUCCESS") {
        acc.success += 1
        acc.revenue += payment.amount
      } else if (payment.status === "PENDING") {
        acc.pending += 1
      } else {
        acc.failed += 1
      }
      return acc
    },
    { success: 0, pending: 0, failed: 0, revenue: 0 },
  )

  return { payments, orgById, totals }
}

export default async function AdminPaymentsPage() {
  const { payments, orgById, totals } = await getAdminStorefrontPayments()

  return (
    <div className="portal-page space-y-6">
      <div>
        <h2 className="mb-1 text-2xl font-bold tracking-tight md:text-3xl">Storefront Payments</h2>
        <p className="max-w-2xl text-muted-foreground">
          Platform oversight of subscriber-owned Paystack storefront transactions. Funds settle to subscribers.
        </p>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <MetricCard label="Successful" value={totals.success} description="Verified storefront collections." icon={CheckCircle2} tone="success" />
        <MetricCard label="Pending" value={totals.pending} description="Initialized or awaiting provider confirmation." icon={Clock3} tone="warning" />
        <MetricCard label="Failed" value={totals.failed} description="Provider failures or abandoned payments." icon={XCircle} tone="destructive" />
        <MetricCard
          label="Subscriber Revenue"
          value={formatGhanaCedis(totals.revenue)}
          description="Settled to subscriber-owned Paystack accounts."
          icon={CircleDollarSign}
          tone="primary"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Storefront Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <EmptyState
              icon={CircleDollarSign}
              title="No storefront payments yet"
              description="Subscriber storefront checkout payments will appear here once customers start paying through connected Paystack accounts."
            />
          ) : (
            <>
          <div className="grid gap-3 xl:hidden lg:grid-cols-2">
            {payments.map((payment) => {
              const orderIds = parseOrderIds(payment.orderIds)
              return (
                <div key={payment.id} className="rounded-md border bg-background p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{orgById.get(payment.organizationId) || payment.organizationId.slice(-8)}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{payment.reference}</p>
                    </div>
                    <Badge variant="outline" className={paymentBadgeClass(payment.status)}>
                      {payment.status}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <p className="font-medium text-foreground">{format(payment.createdAt, "MMM d, yyyy HH:mm")}</p>
                      <p>Created</p>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{formatGhanaCedis(payment.amount)}</p>
                      <p>Amount</p>
                    </div>
                    <div className="col-span-2">
                      <p className="font-medium text-foreground">{payment.paidAt ? format(payment.paidAt, "MMM d, yyyy HH:mm") : "-"}</p>
                      <p>Paid at</p>
                    </div>
                  </div>
                  {orderIds.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {orderIds.slice(0, 4).map((orderId) => (
                        <Link key={orderId} href={`/admin/orders?q=${encodeURIComponent(orderId.slice(-8))}`}>
                          <Badge variant="secondary" className="font-mono text-[10px]">{orderId.slice(-8)}</Badge>
                        </Link>
                      ))}
                      {orderIds.length > 4 ? <span className="text-xs text-muted-foreground">+{orderIds.length - 4}</span> : null}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          <div className="table-scroll hidden rounded-md border bg-background xl:block">
            <Table className="min-w-[900px] text-sm">
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => {
                  const orderIds = parseOrderIds(payment.orderIds)
                  return (
                    <TableRow key={payment.id}>
                      <TableCell>{format(payment.createdAt, "MMM d, yyyy HH:mm")}</TableCell>
                      <TableCell>{orgById.get(payment.organizationId) || payment.organizationId.slice(-8)}</TableCell>
                      <TableCell className="font-mono text-xs">{payment.reference}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={paymentBadgeClass(payment.status)}>
                          {payment.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {orderIds.slice(0, 4).map((orderId) => (
                            <Link key={orderId} href={`/admin/orders?q=${encodeURIComponent(orderId.slice(-8))}`}>
                              <Badge variant="secondary" className="font-mono text-[10px]">{orderId.slice(-8)}</Badge>
                            </Link>
                          ))}
                          {orderIds.length > 4 ? <span className="text-xs text-muted-foreground">+{orderIds.length - 4}</span> : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatGhanaCedis(payment.amount)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
