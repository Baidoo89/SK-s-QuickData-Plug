import Link from "next/link"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { formatGhanaCedis } from "@/lib/currency"
import { format } from "date-fns"
import { CreditCard } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { expireAbandonedStorefrontPayments } from "@/lib/storefront-payment-cleanup"

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

function formatPaymentStatus(value: string) {
  return value.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())
}

function parseServiceRequestIds(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    const rawIds: unknown = parsed && typeof parsed === "object" && "serviceRequestIds" in parsed
      ? (parsed as { serviceRequestIds?: unknown }).serviceRequestIds
      : undefined
    return Array.isArray(rawIds) ? rawIds.filter((item: unknown): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}

async function getStorefrontPayments(status?: string) {
  const session = await auth()
  if (!session?.user?.email) return { payments: [], totals: { success: 0, pending: 0, failed: 0, revenue: 0 } }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { organizationId: true, role: true },
  })

  if (!user?.organizationId || (user.role !== "SUBSCRIBER" && user.role !== "SUPERADMIN")) {
    return { payments: [], totals: { success: 0, pending: 0, failed: 0, revenue: 0 } }
  }

  await expireAbandonedStorefrontPayments(user.organizationId)

  const payments = await db.storefrontPayment.findMany({
    where: { organizationId: user.organizationId, ...(status && status !== "ALL" ? { status } : {}) },
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

export default async function DashboardPaymentsPage(
  props: { searchParams?: Promise<{ [key: string]: string | string[] | undefined }> },
) {
  const searchParams = await props.searchParams
  const requestedStatus = typeof searchParams?.status === "string" ? searchParams.status : "ALL"
  const status = ["ALL", "SUCCESS", "PENDING", "FAILED"].includes(requestedStatus) ? requestedStatus : "ALL"
  const { payments, totals } = await getStorefrontPayments(status)
  const hasFilter = status !== "ALL"

  return (
    <div className="portal-page space-y-5">
      <PageHeader
        as="h2"
        title="Payments"
        description="Customer payments and linked sales."
        actions={<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <form className="flex min-w-0 gap-2" method="GET">
            <select name="status" defaultValue={status} className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-xs sm:w-40 sm:flex-none">
              <option value="ALL">All statuses</option>
              <option value="SUCCESS">Successful</option>
              <option value="PENDING">Pending</option>
              <option value="FAILED">Failed</option>
            </select>
            <Button type="submit" size="sm" className="h-9">Filter</Button>
          </form>
          <Button variant="outline" size="sm" className="h-9" asChild><Link href="/dashboard/orders">View orders</Link></Button>
        </div>}
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 text-xs">
        <span><strong className="text-foreground">{payments.length}</strong> payments{hasFilter ? " shown" : ""}</span>
        <span><strong className="text-foreground">{totals.success}</strong> successful</span>
        <span><strong className="text-foreground">{totals.pending}</strong> pending</span>
        <span><strong className="text-foreground">{totals.failed}</strong> failed</span>
        <span className="font-semibold text-foreground">{formatGhanaCedis(totals.revenue)} paid</span>
      </div>

      <Card className="premium-surface overflow-hidden rounded-lg">
        <CardHeader className="border-b border-border/70 bg-muted/20">
          <CardTitle className="text-sm">Payment history</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title={hasFilter ? "No payments match this status" : "No storefront payments yet"}
              description={hasFilter ? "Choose another status or show all payments." : "Customer payments will appear here after buyers complete checkout."}
              action={hasFilter ? { label: "Show all", href: "/dashboard/payments" } : undefined}
              secondaryAction={!hasFilter ? { label: "Configure payments", href: "/dashboard/settings#payments" } : undefined}
            />
          ) : (
            <>
            <div className="grid gap-3 xl:hidden lg:grid-cols-2">
              {payments.map((payment) => {
                const orderIds = parseOrderIds(payment.orderIds)
                const serviceIds = parseServiceRequestIds(payment.metadata)
                return (
                  <div key={payment.id} className="rounded-lg border border-border/70 bg-background/80 p-3 text-sm shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] font-semibold">{payment.reference}</p>
                        <p className="text-xs text-muted-foreground">{format(payment.createdAt, "MMM d, yyyy HH:mm")}</p>
                      </div>
                      <Badge variant="outline" className={paymentBadgeClass(payment.status)}>
                        {formatPaymentStatus(payment.status)}
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
                    {orderIds.length > 0 || serviceIds.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {orderIds.slice(0, 4).map((orderId) => (
                          <Link key={orderId} href={`/dashboard/orders?q=${encodeURIComponent(orderId.slice(-8))}`}>
                            <Badge variant="secondary" className="font-mono text-[10px]">{orderId.slice(-8)}</Badge>
                          </Link>
                        ))}
                        {orderIds.length > 4 ? <span className="text-xs text-muted-foreground">+{orderIds.length - 4}</span> : null}
                        {serviceIds.slice(0, 4).map((serviceId) => <Badge key={serviceId} variant="outline" className="font-mono text-[10px]">Service {serviceId.slice(-8)}</Badge>)}
                        {serviceIds.length > 4 ? <span className="text-xs text-muted-foreground">+{serviceIds.length - 4} services</span> : null}
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
                    <TableHead>Linked records</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => {
                    const orderIds = parseOrderIds(payment.orderIds)
                    const serviceIds = parseServiceRequestIds(payment.metadata)
                    return (
                      <TableRow key={payment.id}>
                        <TableCell>{format(payment.createdAt, "MMM d, yyyy HH:mm")}</TableCell>
                        <TableCell className="font-mono text-xs">{payment.reference}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={paymentBadgeClass(payment.status)}>
                            {formatPaymentStatus(payment.status)}
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
                            {serviceIds.slice(0, 4).map((serviceId) => <Badge key={serviceId} variant="outline" className="font-mono text-[10px]">Service {serviceId.slice(-8)}</Badge>)}
                            {serviceIds.length > 4 ? <span className="text-xs text-muted-foreground">+{serviceIds.length - 4} services</span> : null}
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
