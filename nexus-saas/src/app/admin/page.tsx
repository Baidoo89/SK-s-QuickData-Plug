import Link from "next/link"
import { AlertTriangle, Building2, CreditCard, UserCheck } from "lucide-react"

import { db } from "@/lib/db"
import { formatGhanaCedis } from "@/lib/currency"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MetricCard } from "@/components/ui/metric-card"
import { PageHeader } from "@/components/ui/page-header"
import { requireSuperAdmin } from "./_actions"

export const dynamic = "force-dynamic"

export default async function AdminOverviewPage() {
  await requireSuperAdmin()

  const [
    totalOrganizations,
    activeOrganizations,
    totalUsers,
    totalSubscribers,
    totalAgents,
    totalResellers,
    totalOrders,
    platformRevenue,
    monthPlatformRevenue,
    storefrontVolume,
    pendingOrders,
    failedOrders,
    activeProducts,
    pendingSignups,
    recentOrders,
    recentAudits,
  ] = await Promise.all([
    db.organization.count(),
    db.organization.count({ where: { active: true } }),
    db.user.count(),
    db.user.count({ where: { role: "SUBSCRIBER" } }),
    db.user.count({ where: { role: "AGENT" } }),
    db.user.count({ where: { role: "RESELLER" } }),
    db.order.count(),
    db.payment.aggregate({ where: { status: "SUCCESS" }, _sum: { amount: true } }),
    db.payment.aggregate({ where: { status: "SUCCESS", paidAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } }, _sum: { amount: true } }),
    db.storefrontPayment.aggregate({ where: { status: "SUCCESS" }, _sum: { amount: true } }),
    db.order.count({ where: { status: "PENDING" } }),
    db.order.count({ where: { status: "FAILED" } }),
    db.product.count({ where: { active: true } }),
    db.user.count({ where: { signupStatus: "PENDING" } }),
    db.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, total: true, status: true, createdAt: true, organization: { select: { name: true } }, customer: { select: { name: true, email: true } } },
    }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 6, include: { organization: { select: { name: true } } } }),
  ])

  const inactiveOrganizations = totalOrganizations - activeOrganizations

  return (
    <div className="portal-page space-y-5">
      <PageHeader
        eyebrow="Platform"
        title="Admin overview"
        description="A quick view of platform health."
        actions={<div className="grid w-full gap-2 sm:grid-cols-3 lg:w-auto">
          <Button asChild size="sm"><Link href="/admin/businesses">Businesses</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/admin/approvals">Approvals</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/admin/system">Health</Link></Button>
        </div>}
      />

      <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
        <MetricCard label="Businesses" value={totalOrganizations} description={`${activeOrganizations} active · ${inactiveOrganizations} inactive`} icon={Building2} tone="primary" />
        <MetricCard label="Revenue" value={formatGhanaCedis(platformRevenue._sum.amount ?? 0)} description={`${formatGhanaCedis(monthPlatformRevenue._sum.amount ?? 0)} this month`} icon={CreditCard} tone="success" />
        <MetricCard label="Orders" value={totalOrders} description={`${pendingOrders} pending · ${failedOrders} failed`} icon={AlertTriangle} tone={failedOrders > 0 ? "warning" : "muted"} />
        <MetricCard label="Approvals" value={pendingSignups} description="Waiting review" icon={UserCheck} tone={pendingSignups > 0 ? "warning" : "muted"} />
      </div>

      <Card className="premium-surface overflow-hidden rounded-lg">
        <CardContent className="grid grid-cols-2 gap-0 p-0 sm:grid-cols-4">
          <div className="border-b border-r border-border/60 p-3 sm:border-b-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Users</p>
            <p className="mt-1 text-lg font-bold">{totalUsers}</p>
            <p className="text-[10px] text-muted-foreground">{totalSubscribers} subscribers · {totalAgents} agents · {totalResellers} resellers</p>
          </div>
          <div className="border-b border-border/60 p-3 sm:border-b-0 sm:border-r">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Products</p>
            <p className="mt-1 text-lg font-bold">{activeProducts}</p>
            <p className="text-[10px] text-muted-foreground">Active</p>
          </div>
          <div className="border-r border-border/60 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Seller sales</p>
            <p className="mt-1 text-lg font-bold">{formatGhanaCedis(storefrontVolume._sum.amount ?? 0)}</p>
            <p className="text-[10px] text-muted-foreground">Paystack volume</p>
          </div>
          <div className="p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Health</p>
            <p className={failedOrders > 0 ? "mt-1 text-lg font-bold text-warning" : "mt-1 text-lg font-bold text-success"}>{failedOrders > 0 ? "Review" : "Stable"}</p>
            <p className="text-[10px] text-muted-foreground">Failed orders</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Card className="premium-surface overflow-hidden rounded-lg">
          <CardHeader className="border-b border-border/70 bg-muted/20"><CardTitle className="text-sm">Recent orders</CardTitle></CardHeader>
          <CardContent className="divide-y p-0">
            {recentOrders.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No orders yet.</p> : recentOrders.map((order) => (
              <div key={order.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{order.organization?.name ?? "No business"}</p><p className="truncate text-xs text-muted-foreground">{order.customer?.name ?? order.customer?.email ?? "Guest"}</p></div>
                <div className="shrink-0 text-right"><Badge variant={order.status === "COMPLETED" ? "secondary" : order.status === "FAILED" ? "destructive" : "outline"}>{order.status}</Badge><p className="mt-1 text-sm font-semibold">{formatGhanaCedis(order.total)}</p></div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="premium-surface overflow-hidden rounded-lg">
          <CardHeader className="border-b border-border/70 bg-muted/20"><CardTitle className="text-sm">Recent activity</CardTitle></CardHeader>
          <CardContent className="divide-y p-0">
            {recentAudits.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No activity yet.</p> : recentAudits.map((log) => (
              <div key={log.id} className="flex items-center justify-between gap-3 p-3"><div className="min-w-0"><p className="truncate text-xs font-semibold">{log.action}</p><p className="truncate text-xs text-muted-foreground">{log.organization?.name ?? "Platform"}</p></div><span className="shrink-0 text-[11px] text-muted-foreground">{new Date(log.createdAt).toLocaleDateString()}</span></div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
