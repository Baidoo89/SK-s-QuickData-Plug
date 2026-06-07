import Link from "next/link"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { formatGhanaCedis } from "@/lib/currency"
import { format } from "date-fns"
import { CheckCircle2, CircleDollarSign, Clock3, CreditCard, XCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { MetricCard } from "@/components/ui/metric-card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

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

async function getStorefrontPayments() {
  const session = await auth()
  if (!session?.user?.email) return { payments: [], totals: { success: 0, pending: 0, failed: 0, revenue: 0 } }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { organizationId: true, role: true },
  })

  if (!user?.organizationId || (user.role !== "SUBSCRIBER" && user.role !== "SUPERADMIN")) {
    return { payments: [], totals: { success: 0, pending: 0, failed: 0, revenue: 0 } }
  }

  const payments = await db.storefrontPayment.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "desc" },
    take: 200,
  })

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

  return { payments, totals }
}

export default async function DashboardPaymentsPage() {
  const { payments, totals } = await getStorefrontPayments()

  return (
    <div className="portal-page space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="mb-1 text-2xl font-bold tracking-tight md:text-3xl">Storefront Payments</h2>
          <p className="max-w-2xl text-muted-foreground">
            Reconcile customer storefront payments against Paystack references and linked orders.
          </p>
        </div>
        <Link href="/dashboard/orders">
          <Button variant="outline" className="w-full text-xs md:w-auto">View Orders</Button>
        </Link>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <MetricCard label="Successful" value={totals.success} description="Paid customer checkouts." icon={CheckCircle2} tone="success" />
        <MetricCard label="Pending" value={totals.pending} description="Started but not confirmed yet." icon={Clock3} tone="warning" />
        <MetricCard label="Failed" value={totals.failed} description="Failed or abandoned payment attempts." icon={XCircle} tone="destructive" />
        <MetricCard label="Paid Revenue" value={formatGhanaCedis(totals.revenue)} description="Settled through your Paystack." icon={CircleDollarSign} tone="primary" />
      </div>

      <Card className="premium-surface overflow-hidden rounded-lg">
        <CardHeader className="border-b border-border/70 bg-muted/20">
          <CardTitle className="text-lg">Payment History</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No storefront payments yet"
              description="Customer payments will appear here after your storefront Paystack settings are connected and buyers complete checkout."
              action={{ label: "Configure Payments", href: "/dashboard/settings" }}
              secondaryAction={{ label: "Review Storefront Setup", href: "/dashboard/setup" }}
            />
          ) : (
            <>
            <div className="grid gap-3 xl:hidden lg:grid-cols-2">
              {payments.map((payment) => {
                const orderIds = parseOrderIds(payment.orderIds)
                return (
                  <div key={payment.id} className="rounded-lg border border-border/70 bg-background/80 p-3 text-sm shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] font-semibold">{payment.reference}</p>
                        <p className="text-xs text-muted-foreground">{format(payment.createdAt, "MMM d, yyyy HH:mm")}</p>
                      </div>
                      <Badge variant="outline" className={paymentBadgeClass(payment.status)}>
                        {payment.status}
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div>
                        <p className="font-semibold text-foreground">{formatGhanaCedis(payment.amount)}</p>
                        <p>Amount</p>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{payment.paidAt ? format(payment.paidAt, "MMM d, yyyy") : "-"}</p>
                        <p>Paid at</p>
                      </div>
                    </div>
                    {orderIds.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {orderIds.slice(0, 4).map((orderId) => (
                          <Link key={orderId} href={`/dashboard/orders?q=${encodeURIComponent(orderId.slice(-8))}`}>
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

            <div className="ops-table-surface table-scroll hidden rounded-lg xl:block">
              <Table className="min-w-[820px] text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
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
                        <TableCell className="font-mono text-xs">{payment.reference}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={paymentBadgeClass(payment.status)}>
                            {payment.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {orderIds.slice(0, 4).map((orderId) => (
                              <Link key={orderId} href={`/dashboard/orders?q=${encodeURIComponent(orderId.slice(-8))}`}>
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
