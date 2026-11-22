import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, ArrowRight, UserRound } from "lucide-react"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { formatGhanaCedis } from "@/lib/currency"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"

export const dynamic = "force-dynamic"

export default async function OwnerResellerDetailPage(props: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const currentUser = await db.user.findUnique({
    where: { email: session.user.email },
    select: { role: true, organizationId: true },
  })

  if (currentUser?.role !== "SUBSCRIBER" || !currentUser.organizationId) redirect("/dashboard")

  const { id } = await props.params
  const reseller = await db.user.findFirst({
    where: { id, organizationId: currentUser.organizationId, role: "RESELLER" },
    select: {
      id: true,
      name: true,
      email: true,
      active: true,
      signupStatus: true,
      createdAt: true,
      parentAgent: { select: { id: true, name: true } },
    },
  })

  if (!reseller) notFound()

  const [walletSummary, orderSummary, profitSummary, recentOrders] = await Promise.all([
    db.walletTransaction.aggregate({
      where: { userId: reseller.id, status: "success" },
      _sum: { amount: true },
    }),
    db.order.aggregate({
      where: { organizationId: currentUser.organizationId, userId: reseller.id, status: "COMPLETED" },
      _count: { _all: true },
      _sum: { total: true },
    }),
    db.orderItem.aggregate({
      where: { order: { organizationId: currentUser.organizationId, userId: reseller.id, status: "COMPLETED" } },
      _sum: { profit: true },
    }),
    db.order.findMany({
      where: { organizationId: currentUser.organizationId, userId: reseller.id },
      select: { id: true, phoneNumber: true, status: true, total: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ])

  const active = reseller.active && reseller.signupStatus === "APPROVED"
  const walletBalance = walletSummary._sum.amount ?? 0
  const orderCount = orderSummary._count._all
  const salesVolume = orderSummary._sum.total ?? 0
  const profit = profitSummary._sum.profit ?? 0

  return (
    <div className="portal-page flex flex-col gap-6">
      <PageHeader
        eyebrow="Team / Resellers"
        title={reseller.name || "Unnamed reseller"}
        description={reseller.email || "No email provided"}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild><Link href={`/dashboard/orders?userId=${reseller.id}`}>View orders</Link></Button>
            <Button asChild variant="outline"><Link href="/dashboard/users/resellers"><ArrowLeft className="mr-2 h-4 w-4" />Back to resellers</Link></Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/75 bg-muted/20 px-3 py-3 text-xs">
        <Badge variant={active ? "secondary" : "outline"} className={active ? "status-success border" : "status-warning border"}>
          {active ? "Active" : reseller.signupStatus === "PENDING" ? "Pending" : "Inactive"}
        </Badge>
        <span className="text-muted-foreground">Joined {new Date(reseller.createdAt).toLocaleDateString()}</span>
        {reseller.parentAgent ? (
          <Link href={`/dashboard/agents/${reseller.parentAgent.id}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            Agent: {reseller.parentAgent.name} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : <span className="text-muted-foreground">No parent agent</span>}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-lg border border-border/75 bg-background px-3 py-3 text-xs">
        <div><span className="text-muted-foreground">Wallet</span> <span className="font-semibold text-foreground">{formatGhanaCedis(walletBalance)}</span></div>
        <div><span className="text-muted-foreground">Orders</span> <span className="font-semibold text-foreground">{orderCount}</span></div>
        <div><span className="text-muted-foreground">Sales volume</span> <span className="font-semibold text-foreground">{formatGhanaCedis(salesVolume)}</span></div>
        <div><span className="text-muted-foreground">Profit</span> <span className="font-semibold text-primary">{formatGhanaCedis(profit)}</span></div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Recent orders</CardTitle>
          <CardDescription className="text-xs">Latest orders placed by this reseller.</CardDescription>
        </CardHeader>
        <CardContent>
          {recentOrders.length === 0 ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><UserRound className="h-4 w-4" />No orders yet.</div>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border/70">
              {recentOrders.map((order) => (
                <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{order.phoneNumber || "No phone"}</p>
                    <p className="text-muted-foreground">{new Date(order.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-muted px-2 py-0.5 font-semibold uppercase text-muted-foreground">{order.status}</span>
                    <span className="font-semibold text-foreground">{formatGhanaCedis(order.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
