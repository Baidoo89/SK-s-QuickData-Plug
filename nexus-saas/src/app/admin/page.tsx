import Link from "next/link"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { hash } from "bcryptjs"
import { AlertTriangle, Building2, CreditCard, PackageCheck, ShieldCheck, ShoppingCart, UserCheck, Users } from "lucide-react"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { formatGhanaCedis } from "@/lib/currency"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { MetricCard } from "@/components/ui/metric-card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export const dynamic = "force-dynamic"

type AdminSearchParams = {
  q?: string | string[]
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
}

function addMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

async function requireSuperAdmin() {
  const session = await auth()
  const role = (session?.user as { role?: string } | undefined)?.role

  if (!session?.user || role !== "SUPERADMIN") {
    redirect("/login")
  }

  return session
}

async function setOrganizationStatus(formData: FormData) {
  "use server"

  await requireSuperAdmin()

  const organizationId = String(formData.get("organizationId") ?? "")
  const active = String(formData.get("active") ?? "") === "true"

  if (!organizationId) {
    return
  }

  const before = await db.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, slug: true, active: true },
  })

  if (!before) {
    return
  }

  await db.organization.update({
    where: { id: organizationId },
    data: { active },
  })

  await db.auditLog.create({
    data: {
      action: active ? "SUPERADMIN_ACTIVATE_ORG" : "SUPERADMIN_DEACTIVATE_ORG",
      targetType: "ORGANIZATION",
      targetId: organizationId,
      organizationId,
      actorName: "Super Admin",
      before: JSON.stringify(before),
      after: JSON.stringify({ ...before, active }),
      meta: JSON.stringify({ source: "admin_overview" }),
    },
  })

  revalidatePath("/admin")
}

async function createSubscriberTenant(formData: FormData) {
  "use server"

  await requireSuperAdmin()

  const orgName = String(formData.get("orgName") ?? "").trim()
  const requestedSlug = String(formData.get("slug") ?? "").trim()
  const ownerName = String(formData.get("ownerName") ?? "").trim()
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")
  const planId = String(formData.get("planId") ?? "")
  const subscriptionStatus = String(formData.get("subscriptionStatus") ?? "ACTIVE")

  if (!orgName || !ownerName || !ownerEmail || !password || !planId) {
    return
  }

  const slug = slugify(requestedSlug || orgName)
  if (!slug || password.length < 6 || !ownerEmail.includes("@")) {
    return
  }

  const [existingOrg, existingUser, plan] = await Promise.all([
    db.organization.findUnique({ where: { slug }, select: { id: true } }),
    db.user.findFirst({
      where: { email: { equals: ownerEmail, mode: "insensitive" } },
      select: { id: true },
    }),
    db.plan.findUnique({ where: { id: planId }, select: { id: true, name: true } }),
  ])

  if (existingOrg || existingUser || !plan) {
    return
  }

  const passwordHash = await hash(password, 10)
  const shouldCreateSubscription = subscriptionStatus !== "NONE"
  const now = new Date()

  const result = await db.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: orgName,
        slug,
        active: true,
      },
    })

    const owner = await tx.user.create({
      data: {
        name: ownerName,
        email: ownerEmail,
        password: passwordHash,
        role: "SUBSCRIBER",
        active: true,
        signupStatus: "APPROVED",
        organizationId: organization.id,
      },
    })

    const subscription = shouldCreateSubscription
      ? await tx.subscription.create({
          data: {
            organizationId: organization.id,
            planId: plan.id,
            status: subscriptionStatus,
            nextBillingAt: subscriptionStatus === "ACTIVE" ? addMonths(now, 1) : null,
            canceledAt: subscriptionStatus === "CANCELED" ? now : null,
            paystackRef: `manual-${organization.id.slice(-8)}-${Date.now()}`,
          },
        })
      : null

    await tx.auditLog.create({
      data: {
        action: "SUPERADMIN_CREATE_SUBSCRIBER_TENANT",
        targetType: "ORGANIZATION",
        targetId: organization.id,
        organizationId: organization.id,
        actorName: "Super Admin",
        after: JSON.stringify({
          organization: { id: organization.id, name: organization.name, slug: organization.slug },
          owner: { id: owner.id, email: owner.email },
          subscription: subscription ? { id: subscription.id, status: subscription.status, planId: subscription.planId } : null,
        }),
        meta: JSON.stringify({ source: "admin_tenant_control", planName: plan.name }),
      },
    })

    return { organization }
  })

  revalidatePath("/admin")
  revalidatePath("/admin/subscriptions")
  redirect(`/admin?q=${encodeURIComponent(result.organization.slug)}`)
}

export default async function SuperAdminPage({
  searchParams,
}: {
  searchParams?: AdminSearchParams
}) {
  await requireSuperAdmin()

  const qRaw = typeof searchParams?.q === "string" ? searchParams.q.trim() : ""
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

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

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
    plans,
    organizations,
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
    db.payment.aggregate({
      where: { status: "SUCCESS" },
      _sum: { amount: true },
    }),
    db.payment.aggregate({
      where: { status: "SUCCESS", paidAt: { gte: startOfMonth } },
      _sum: { amount: true },
    }),
    db.storefrontPayment.aggregate({
      where: { status: "SUCCESS" },
      _sum: { amount: true },
    }),
    db.order.count({ where: { status: "PENDING" } }),
    db.order.count({ where: { status: "FAILED" } }),
    db.product.count({ where: { active: true } }),
    db.user.count({ where: { signupStatus: "PENDING" } }),
    db.plan.findMany({
      orderBy: [{ priceGHS: "asc" }, { name: "asc" }],
      select: { id: true, name: true, priceGHS: true, maxProducts: true, maxAgents: true },
    }),
    db.organization.findMany({
      where: orgWhere,
      orderBy: { createdAt: "desc" },
      take: 25,
      include: {
        users: {
          select: { email: true, role: true, active: true, signupStatus: true },
          orderBy: { createdAt: "asc" },
        },
        products: { where: { active: true }, select: { id: true } },
        subscription: {
          select: {
            status: true,
            nextBillingAt: true,
            plan: { select: { name: true, priceGHS: true } },
          },
        },
        _count: {
          select: {
            orders: true,
            customers: true,
            agents: true,
            products: true,
          },
        },
      },
    }),
    db.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        total: true,
        status: true,
        createdAt: true,
        organization: { select: { name: true } },
        customer: { select: { name: true, email: true } },
      },
    }),
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { organization: { select: { name: true } } },
    }),
  ])

  const inactiveOrganizations = totalOrganizations - activeOrganizations

  return (
    <div className="portal-page space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Owner console</p>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Super Admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage businesses, plans, approvals, and platform health.
          </p>
        </div>
        <div className="grid w-full gap-2 sm:grid-cols-3 lg:w-auto">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/subscriptions">Subscriptions</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/approvals">Approvals</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/admin/system">Health</Link>
          </Button>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Businesses" value={totalOrganizations} description={`${activeOrganizations} active, ${inactiveOrganizations} inactive`} icon={Building2} tone="primary" />
        <MetricCard label="Revenue" value={formatGhanaCedis(platformRevenue._sum.amount ?? 0)} description={`${formatGhanaCedis(monthPlatformRevenue._sum.amount ?? 0)} this month`} icon={CreditCard} tone="success" />
        <MetricCard label="Seller Sales" value={formatGhanaCedis(storefrontVolume._sum.amount ?? 0)} description="Seller Paystack volume" icon={ShoppingCart} tone="info" />
        <MetricCard label="Users" value={totalUsers} description={`${totalSubscribers} subscribers, ${totalAgents} agents, ${totalResellers} resellers`} icon={Users} tone="info" />
        <MetricCard label="Orders" value={failedOrders > 0 ? failedOrders : pendingOrders} description={`${pendingOrders} pending, ${failedOrders} failed`} icon={AlertTriangle} tone={failedOrders > 0 ? "warning" : "muted"} />
        <MetricCard label="Products" value={activeProducts} description="Active products" icon={PackageCheck} tone="primary" />
        <MetricCard label="Approvals" value={pendingSignups} description="Waiting review" icon={UserCheck} tone={pendingSignups > 0 ? "warning" : "muted"} />
        <MetricCard label="Health" value={failedOrders > 0 ? "Review" : "Stable"} description="Failed order signal" icon={ShieldCheck} tone={failedOrders > 0 ? "warning" : "success"} />
      </div>

      <Card className="premium-surface overflow-hidden rounded-lg">
        <CardHeader className="border-b border-border/70 bg-muted/20">
          <CardTitle>Add Business</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a business account and owner login.
          </p>
        </CardHeader>
        <CardContent>
          <form action={createSubscriberTenant} className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-[1.1fr_0.9fr_1fr_1fr_0.9fr_0.9fr_auto] xl:items-end">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Organization</span>
              <Input name="orgName" placeholder="Quick Data Ltd" required />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Slug</span>
              <Input name="slug" placeholder="quick-data" />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Owner name</span>
              <Input name="ownerName" placeholder="Owner name" required />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Owner email</span>
              <Input name="ownerEmail" type="email" placeholder="owner@example.com" required />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Password</span>
              <Input name="password" type="password" placeholder="Min. 6 chars" required minLength={6} />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Plan</span>
              <select
                name="planId"
                required
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                defaultValue={plans[0]?.id ?? ""}
              >
                <option value="" disabled>Select plan</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} - {formatGhanaCedis(plan.priceGHS)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 md:col-span-2 xl:col-span-1">
              <span className="text-xs text-muted-foreground">Access</span>
              <select
                name="subscriptionStatus"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                defaultValue="ACTIVE"
              >
                <option value="ACTIVE">Activate now</option>
                <option value="PENDING">Create pending</option>
                <option value="EXPIRED">Create expired</option>
                <option value="CANCELED">Create canceled</option>
                <option value="NONE">No subscription</option>
              </select>
            </div>
            <Button type="submit" className="md:col-span-2 xl:col-span-1">
              Create
            </Button>
          </form>
          {plans.length === 0 ? (
            <p className="mt-3 text-xs text-warning">Create at least one plan in Subscriptions before onboarding tenants.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="premium-surface overflow-hidden rounded-lg">
        <CardHeader className="border-b border-border/70 bg-muted/20">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
          <CardTitle>Businesses</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Search, suspend, or reactivate businesses.
              </p>
            </div>
            <form className="grid w-full gap-2 sm:grid-cols-[minmax(0,1fr)_auto] lg:w-auto" method="GET">
              <Input name="q" defaultValue={q} placeholder="Search business or owner" className="lg:w-80" />
              <Button type="submit" variant="outline">Search</Button>
            </form>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 xl:hidden md:grid-cols-2">
            {organizations.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No organizations match your search.</p>
            ) : (
              organizations.map((org) => {
                const owner = org.users.find((user) => user.role === "SUBSCRIBER") ?? org.users[0]
                return (
                  <div key={org.id} className="rounded-lg border border-border/70 bg-background/80 p-3 text-sm shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{org.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">/{org.slug}</p>
                      </div>
                      <Badge variant={org.active ? "secondary" : "destructive"} className={org.active ? "status-success border" : ""}>
                        {org.active ? "Active" : "Suspended"}
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div>
                        <p className="font-medium text-foreground">{org.subscription?.plan?.name ?? "No plan"}</p>
                        <p>{org.subscription?.status ?? "UNASSIGNED"}</p>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{org._count.orders}</p>
                        <p>Orders</p>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{owner?.email ?? "-"}</p>
                        <p>Owner</p>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{org._count.agents} agents</p>
                        <p>{org.products.length}/{org._count.products} products active</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button asChild size="sm" variant="outline" className="text-xs">
                        <Link href={`/shop/${org.slug}`} target="_blank">View Store</Link>
                      </Button>
                      <form action={setOrganizationStatus}>
                        <input type="hidden" name="organizationId" value={org.id} />
                        <input type="hidden" name="active" value={String(!org.active)} />
                        <Button size="sm" variant={org.active ? "destructive" : "default"} type="submit" className="w-full text-xs">
                          {org.active ? "Suspend" : "Reactivate"}
                        </Button>
                      </form>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <div className="ops-table-surface table-scroll hidden rounded-lg xl:block">
          <Table className="min-w-[900px] text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Subscription</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Agents</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Products</TableHead>
                <TableHead className="text-right">Control</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    No organizations match your search.
                  </TableCell>
                </TableRow>
              ) : (
                organizations.map((org) => {
                  const owner = org.users.find((user) => user.role === "SUBSCRIBER") ?? org.users[0]
                  return (
                    <TableRow key={org.id}>
                      <TableCell>
                        <div className="font-medium">{org.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">/{org.slug}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={org.active ? "secondary" : "destructive"} className={org.active ? "status-success border" : ""}>
                          {org.active ? "Active" : "Suspended"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{org.subscription?.plan?.name ?? "No plan"}</div>
                        <div className="text-xs text-muted-foreground">
                          {org.subscription?.status ?? "UNASSIGNED"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{owner?.email ?? "-"}</div>
                        <div className="text-xs text-muted-foreground">{org.users.length} user accounts</div>
                      </TableCell>
                      <TableCell className="text-right">{org._count.agents}</TableCell>
                      <TableCell className="text-right">{org._count.orders}</TableCell>
                      <TableCell className="text-right">{org.products.length}/{org._count.products}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/shop/${org.slug}`} target="_blank">Store</Link>
                          </Button>
                          <form action={setOrganizationStatus}>
                            <input type="hidden" name="organizationId" value={org.id} />
                            <input type="hidden" name="active" value={String(!org.active)} />
                            <Button size="sm" variant={org.active ? "destructive" : "default"} type="submit">
                              {org.active ? "Suspend" : "Reactivate"}
                            </Button>
                          </form>
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

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Card className="premium-surface overflow-hidden rounded-lg">
          <CardHeader className="border-b border-border/70 bg-muted/20">
            <CardTitle>Recent Orders</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Read-only platform view.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No orders yet.</p>
            ) : (
              recentOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/80 p-3 shadow-sm">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{order.organization?.name ?? "No organization"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {order.customer?.name ?? order.customer?.email ?? "Guest"} - {new Date(order.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant={order.status === "COMPLETED" ? "secondary" : order.status === "FAILED" ? "destructive" : "outline"}>
                      {order.status}
                    </Badge>
                    <p className="mt-1 text-sm font-semibold">{formatGhanaCedis(order.total)}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="premium-surface overflow-hidden rounded-lg">
          <CardHeader className="border-b border-border/70 bg-muted/20">
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentAudits.length === 0 ? (
              <p className="text-sm text-muted-foreground">No audit logs yet.</p>
            ) : (
              recentAudits.map((log) => (
                <div key={log.id} className="rounded-lg border border-border/70 bg-background/80 p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="font-mono text-xs">{log.action}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {log.organization?.name ?? "Platform"} - {log.actorName ?? log.actorId ?? "System"}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
