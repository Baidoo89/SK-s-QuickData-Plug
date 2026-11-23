import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ui/page-header"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { db } from "@/lib/db"
import { requireSuperAdmin, setOrganizationStatus } from "../_actions"

export const dynamic = "force-dynamic"

type SearchParams = { q?: string | string[] }

export default async function AdminBusinessesPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  await requireSuperAdmin()

  const params = await searchParams
  const qRaw = typeof params?.q === "string" ? params.q.trim() : ""
  const q = qRaw.slice(0, 80)
  const orgWhere = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { slug: { contains: q, mode: "insensitive" as const } },
          { users: { some: { email: { contains: q, mode: "insensitive" as const } } } },
        ],
      }
    : undefined

  const organizations = await db.organization.findMany({
    where: orgWhere,
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      users: { select: { email: true, role: true }, orderBy: { createdAt: "asc" } },
      products: { where: { active: true }, select: { id: true } },
      subscription: { select: { status: true, plan: { select: { name: true } } } },
      _count: { select: { orders: true, agents: true, products: true } },
    },
  })

  return (
    <div className="portal-page space-y-5">
      <PageHeader
        eyebrow="Platform"
        title="Businesses"
        description="Open a business for full details and controls."
        actions={<Button asChild><Link href="/admin/businesses/new">Add business</Link></Button>}
      />

      <Card className="premium-surface overflow-hidden rounded-lg">
        <CardHeader className="border-b border-border/70 bg-muted/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm">Directory</CardTitle>
            <form className="flex w-full gap-2 sm:w-auto" method="GET">
              <Input name="q" defaultValue={q} placeholder="Search businesses" className="sm:w-64" />
              <Button type="submit" variant="outline">Search</Button>
            </form>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {organizations.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No businesses found.</p>
          ) : (
            <>
              <div className="divide-y md:hidden">
                {organizations.map((org) => {
                  const owner = org.users.find((user) => user.role === "SUBSCRIBER") ?? org.users[0]
                  return (
                    <div key={org.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3">
                      <Link href={`/admin/businesses/${org.id}`} className="min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <p className="truncate text-sm font-semibold">{org.name}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">/{org.slug}</p>
                        <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                          <Badge variant={org.active ? "secondary" : "destructive"} className={org.active ? "status-success border" : ""}>{org.active ? "Active" : "Suspended"}</Badge>
                          <span className="truncate">{org.subscription?.plan?.name ?? "No plan"}</span>
                          <span className="shrink-0">{org._count.orders} orders</span>
                        </div>
                        <p className="mt-1 truncate text-[11px] text-muted-foreground">{owner?.email ?? "No owner"}</p>
                      </Link>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Link href={`/admin/businesses/${org.id}`} className="text-xs font-semibold text-primary hover:underline">Open</Link>
                        <form action={setOrganizationStatus}>
                          <input type="hidden" name="organizationId" value={org.id} />
                          <input type="hidden" name="active" value={String(!org.active)} />
                          <Button size="sm" variant="ghost" type="submit" className="h-7 px-1.5 text-[11px]">{org.active ? "Suspend" : "Restore"}</Button>
                        </form>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="table-scroll hidden md:block">
                <Table className="min-w-[820px] text-sm">
                  <TableHeader><TableRow><TableHead>Business</TableHead><TableHead>Status</TableHead><TableHead>Plan</TableHead><TableHead>Owner</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {organizations.map((org) => {
                      const owner = org.users.find((user) => user.role === "SUBSCRIBER") ?? org.users[0]
                      return (
                        <TableRow key={org.id}>
                          <TableCell><Link href={`/admin/businesses/${org.id}`} className="font-medium hover:text-primary">{org.name}</Link><div className="font-mono text-xs text-muted-foreground">/{org.slug}</div></TableCell>
                          <TableCell><Badge variant={org.active ? "secondary" : "destructive"} className={org.active ? "status-success border" : ""}>{org.active ? "Active" : "Suspended"}</Badge></TableCell>
                          <TableCell>{org.subscription?.plan?.name ?? "No plan"}<div className="text-xs text-muted-foreground">{org.subscription?.status ?? "UNASSIGNED"}</div></TableCell>
                          <TableCell className="text-sm text-muted-foreground">{owner?.email ?? "-"}</TableCell>
                          <TableCell className="text-right">{org._count.orders}</TableCell>
                          <TableCell><div className="flex justify-end gap-2"><Button asChild size="sm" variant="outline"><Link href={`/admin/businesses/${org.id}`}>Open</Link></Button><form action={setOrganizationStatus}><input type="hidden" name="organizationId" value={org.id} /><input type="hidden" name="active" value={String(!org.active)} /><Button size="sm" variant={org.active ? "destructive" : "default"} type="submit">{org.active ? "Suspend" : "Restore"}</Button></form></div></TableCell>
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
