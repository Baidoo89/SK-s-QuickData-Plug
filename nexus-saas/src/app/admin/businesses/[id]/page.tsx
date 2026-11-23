import Link from "next/link"
import { notFound } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import { db } from "@/lib/db"
import { formatGhanaCedis } from "@/lib/currency"
import { requireSuperAdmin, setOrganizationStatus } from "../../_actions"

export const dynamic = "force-dynamic"

export default async function BusinessDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin()
  const { id } = await params
  const organization = await db.organization.findUnique({
    where: { id },
    include: {
      users: { select: { name: true, email: true, role: true, active: true, signupStatus: true }, orderBy: { createdAt: "asc" } },
      subscription: { select: { status: true, nextBillingAt: true, plan: { select: { name: true, priceGHS: true } } } },
      _count: { select: { users: true, orders: true, customers: true, agents: true, products: true } },
    },
  })

  if (!organization) notFound()

  const owner = organization.users.find((user) => user.role === "SUBSCRIBER") ?? organization.users[0]

  return (
    <div className="portal-page max-w-5xl space-y-5">
      <PageHeader
        eyebrow="Businesses"
        title={organization.name}
        description={`/${organization.slug}`}
        actions={<div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/admin/businesses">Back</Link></Button><Button asChild variant="outline"><Link href={`/shop/${organization.slug}`} target="_blank">Open store</Link></Button><form action={setOrganizationStatus}><input type="hidden" name="organizationId" value={organization.id} /><input type="hidden" name="active" value={String(!organization.active)} /><Button type="submit" variant={organization.active ? "destructive" : "default"}>{organization.active ? "Suspend" : "Restore"}</Button></form></div>}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3">
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Status</p><Badge variant={organization.active ? "secondary" : "destructive"} className={`mt-2 ${organization.active ? "status-success border" : ""}`}>{organization.active ? "Active" : "Suspended"}</Badge></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Users</p><p className="mt-1 text-xl font-bold">{organization._count.users}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Orders</p><p className="mt-1 text-xl font-bold">{organization._count.orders}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Agents</p><p className="mt-1 text-xl font-bold">{organization._count.agents}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Products</p><p className="mt-1 text-xl font-bold">{organization._count.products}</p></CardContent></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="premium-surface overflow-hidden rounded-lg"><CardHeader className="border-b border-border/70 bg-muted/20"><CardTitle className="text-sm">Owner</CardTitle></CardHeader><CardContent className="space-y-2 p-4"><p className="font-medium">{owner?.name ?? "Unnamed owner"}</p><p className="text-sm text-muted-foreground">{owner?.email ?? "No owner email"}</p><div className="flex gap-2"><Badge variant="outline">{owner?.active ? owner.signupStatus : "SUSPENDED"}</Badge><span className="text-xs text-muted-foreground">{organization._count.customers} customers</span></div></CardContent></Card>
        <Card className="premium-surface overflow-hidden rounded-lg"><CardHeader className="border-b border-border/70 bg-muted/20"><CardTitle className="text-sm">Subscription</CardTitle></CardHeader><CardContent className="space-y-2 p-4"><p className="font-medium">{organization.subscription?.plan?.name ?? "No plan"}</p><p className="text-sm text-muted-foreground">{organization.subscription?.status ?? "UNASSIGNED"}</p><p className="text-xs text-muted-foreground">{organization.subscription?.plan ? formatGhanaCedis(organization.subscription.plan.priceGHS) : ""}{organization.subscription?.nextBillingAt ? ` · next billing ${new Date(organization.subscription.nextBillingAt).toLocaleDateString()}` : ""}</p></CardContent></Card>
      </div>
    </div>
  )
}
