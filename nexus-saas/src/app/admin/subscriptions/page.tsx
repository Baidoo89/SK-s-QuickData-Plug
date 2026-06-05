import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { CreditCard, Layers3, ReceiptText, Store, Users } from "lucide-react"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { formatGhanaCedis } from "@/lib/currency"
import { ensureSaasPlans, expireOverdueSubscriptions, getNextBillingDate } from "@/lib/subscription-access"
import { formatPlanFeatures, parsePlanFeatures } from "@/lib/saas-plans"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { MetricCard } from "@/components/ui/metric-card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

export const dynamic = "force-dynamic"

async function requireSuperAdmin() {
  const session = await auth()
  const role = (session?.user as { role?: string } | undefined)?.role

  if (!session?.user || role !== "SUPERADMIN") {
    redirect("/login")
  }
}

async function createPlan(formData: FormData) {
  "use server"

  await requireSuperAdmin()

  const planId = String(formData.get("planId") ?? "").trim()
  const name = String(formData.get("name") ?? "").trim()
  const priceGHS = Number(formData.get("priceGHS") ?? 0)
  const maxProducts = Number(formData.get("maxProducts") ?? 10)
  const maxAgents = Number(formData.get("maxAgents") ?? 5)
  const description = String(formData.get("description") ?? "").trim()
  const features = formatPlanFeatures(String(formData.get("features") ?? ""))
  const active = formData.get("active") === "on"
  const visible = formData.get("visible") === "on"
  const recommended = active && visible && formData.get("recommended") === "on"

  if (!name || !Number.isFinite(priceGHS) || priceGHS < 0) {
    return
  }

  const data = {
    name,
    description,
    priceGHS,
    maxProducts: Number.isFinite(maxProducts) ? maxProducts : 10,
    maxAgents: Number.isFinite(maxAgents) ? maxAgents : 5,
    features,
    active,
    visible,
    recommended,
    retiredAt: active ? null : new Date(),
  }

  let savedPlan
  if (planId) {
    savedPlan = await db.plan.update({
      where: { id: planId },
      data,
    })
  } else {
    savedPlan = await db.plan.upsert({
      where: { name },
      update: data,
      create: data,
    })
  }

  if (recommended) {
    await db.plan.updateMany({
      where: { id: { not: savedPlan.id } },
      data: { recommended: false },
    })
  }

  revalidatePath("/admin/subscriptions")
  revalidatePath("/pricing")
  revalidatePath("/dashboard/subscription")
}

async function updateSubscriptionStatus(formData: FormData) {
  "use server"

  await requireSuperAdmin()

  const subscriptionId = String(formData.get("subscriptionId") ?? "")
  const status = String(formData.get("status") ?? "")
  const allowed = new Set(["ACTIVE", "CANCELED", "PENDING", "EXPIRED"])

  if (!subscriptionId || !allowed.has(status)) {
    return
  }

  await db.subscription.update({
    where: { id: subscriptionId },
    data: {
      status,
      canceledAt: status === "CANCELED" ? new Date() : null,
    },
  })

  revalidatePath("/admin/subscriptions")
  revalidatePath("/admin")
}

async function extendSubscription(formData: FormData) {
  "use server"

  await requireSuperAdmin()

  const subscriptionId = String(formData.get("subscriptionId") ?? "").trim()
  const months = Number(formData.get("months") ?? 1)
  const customDateRaw = String(formData.get("customDate") ?? "").trim()

  const subscription = subscriptionId
    ? await db.subscription.findUnique({
        where: { id: subscriptionId },
        include: { plan: true },
      })
    : null

  if (!subscription) {
    return
  }

  const customDate = customDateRaw ? new Date(customDateRaw) : null
  const nextBillingAt =
    customDate && !Number.isNaN(customDate.getTime())
      ? customDate
      : getNextBillingDate(subscription.nextBillingAt, Number.isFinite(months) && months > 0 ? months : 1)
  const reference = `MANUAL-SUB-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const updated = await db.subscription.update({
    where: { id: subscription.id },
    data: {
      status: "ACTIVE",
      canceledAt: null,
      nextBillingAt,
      paystackRef: reference,
    },
  })

  await db.payment.create({
    data: {
      subscriptionId: updated.id,
      amount: subscription.plan.priceGHS,
      paystackRef: reference,
      status: "SUCCESS",
      paidAt: new Date(),
    },
  })

  revalidatePath("/admin/subscriptions")
  revalidatePath("/admin")
  revalidatePath("/dashboard/subscription")
}

async function assignDefaultPlan(formData: FormData) {
  "use server"

  await requireSuperAdmin()

  const organizationId = String(formData.get("organizationId") ?? "")
  const planId = String(formData.get("planId") ?? "")
  const plan = planId ? await db.plan.findUnique({ where: { id: planId } }) : null

  if (!organizationId || !plan) {
    return
  }

  const reference = `MANUAL-ACTIVATE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const subscription = await db.subscription.upsert({
    where: { organizationId },
    update: {
      planId: plan.id,
      status: "ACTIVE",
      nextBillingAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      canceledAt: null,
      paystackRef: reference,
    },
    create: {
      organizationId,
      planId: plan.id,
      status: "ACTIVE",
      nextBillingAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      paystackRef: reference,
    },
  })

  await db.payment.create({
    data: {
      subscriptionId: subscription.id,
      amount: plan.priceGHS,
      paystackRef: reference,
      status: "SUCCESS",
      paidAt: new Date(),
    },
  })

  revalidatePath("/admin/subscriptions")
  revalidatePath("/admin")
}

function subscriptionBadgeClass(status: string) {
  if (status === "ACTIVE") return "status-success border"
  if (status === "PENDING") return "status-warning border"
  if (status === "EXPIRED") return "status-info border"
  return ""
}

export default async function AdminSubscriptionsPage() {
  await requireSuperAdmin()
  await ensureSaasPlans()
  await expireOverdueSubscriptions()

  const [plans, subscriptions, organizations, paymentAgg, activeSubs, pendingSubs] = await Promise.all([
    db.plan.findMany({
      orderBy: { priceGHS: "asc" },
      include: { _count: { select: { subscriptions: true } } },
    }),
    db.subscription.findMany({
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        organization: { select: { name: true, slug: true, active: true } },
        plan: { select: { name: true, priceGHS: true } },
        payments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { amount: true, status: true, paidAt: true },
        },
      },
    }),
    db.organization.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        subscription: { select: { id: true, status: true } },
      },
    }),
    db.payment.aggregate({
      where: { status: "SUCCESS" },
      _sum: { amount: true },
    }),
    db.subscription.count({ where: { status: "ACTIVE" } }),
    db.subscription.count({ where: { status: "PENDING" } }),
  ])
  const publicPlans = plans.filter((plan) => plan.active && plan.visible && !plan.retiredAt)
  const retiredPlans = plans.filter((plan) => !plan.active || plan.retiredAt)

  return (
    <div className="portal-page space-y-6">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">SaaS billing</p>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Plans & Billing</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Control SaaS plans, subscription records, and tenant access to paid platform features.
        </p>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <MetricCard label="Plans" value={plans.length} description={`${publicPlans.length} public, ${retiredPlans.length} retired or disabled.`} icon={Layers3} tone="primary" />
        <MetricCard
          label="Active Subscriptions"
          value={activeSubs}
          description={`${pendingSubs} pending subscriptions.`}
          icon={CreditCard}
          tone="success"
        />
        <MetricCard
          label="Collected Payments"
          value={formatGhanaCedis(paymentAgg._sum.amount ?? 0)}
          description="Successful platform subscription payments."
          icon={ReceiptText}
          tone="info"
        />
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">Pricing Ownership Rule</CardTitle>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Superadmin controls only SaaS plan pricing and subscription access. Subscriber bundle prices, storefront prices, agent margins, reseller margins, wallets, and Paystack settlement stay inside each tenant workspace.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border bg-background p-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CreditCard className="h-4 w-4 text-primary" />
                Platform-owned
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Plans, subscription status, platform billing collections.</p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Store className="h-4 w-4 text-primary" />
                Subscriber-owned
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Storefront prices, customer revenue, Paystack settlement, product margins.</p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4 text-primary" />
                Tenant hierarchy
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Agent and reseller pricing stays under the subscriber organization.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create New Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createPlan} className="grid min-w-0 gap-3 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_140px_140px_140px_auto]">
            <Input name="name" placeholder="Plan name" required />
            <Input name="priceGHS" type="number" min="0" step="0.01" placeholder="Price" required />
            <Input name="maxProducts" type="number" min="1" placeholder="Products" />
            <Input name="maxAgents" type="number" min="1" placeholder="Agents" />
            <Button type="submit" className="w-full">Save Plan</Button>
            <Input name="description" placeholder="Short description" className="lg:col-span-2 2xl:col-span-5" />
            <Textarea
              name="features"
              placeholder={"Feature list, one per line\n1 subscriber workspace\nStorefront checkout\nAPI access"}
              className="lg:col-span-2 2xl:col-span-5"
            />
            <div className="grid min-w-0 gap-3 text-sm md:grid-cols-3 lg:col-span-2 2xl:col-span-5">
              <label className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                <input name="active" type="checkbox" defaultChecked className="h-4 w-4" />
                <span>Available for checkout</span>
              </label>
              <label className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                <input name="visible" type="checkbox" defaultChecked className="h-4 w-4" />
                <span>Show publicly</span>
              </label>
              <label className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                <input name="recommended" type="checkbox" className="h-4 w-4" />
                <span>Recommended</span>
              </label>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual Subscriber Activation</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={assignDefaultPlan} className="grid min-w-0 gap-3 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_220px_auto]">
            <select name="organizationId" className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm" required>
              <option value="">Choose subscriber organization</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} /{org.slug} {org.subscription ? `(${org.subscription.status})` : "(no subscription)"}
                </option>
              ))}
            </select>
            <select name="planId" className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm" required>
              <option value="">Choose plan</option>
              {publicPlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} - {formatGhanaCedis(plan.priceGHS)}
                </option>
              ))}
            </select>
            <Button type="submit" className="w-full">Activate Plan</Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            Gives the organization 30 days of active SaaS access on the selected plan.
          </p>
        </CardContent>
      </Card>

      <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle>Editable Plan Catalog</CardTitle>
            <p className="text-sm text-muted-foreground">
              Changes here appear on `/pricing`, subscriber subscription selection, Paystack checkout, and plan limit enforcement.
            </p>
          </CardHeader>
          <CardContent className="min-w-0 space-y-3">
            {plans.length === 0 ? (
              <p className="text-sm text-muted-foreground">No plans configured yet.</p>
            ) : (
              plans.map((plan) => (
                <div key={plan.id} className="min-w-0 rounded-md border border-border p-3">
                  <form action={createPlan} className="space-y-3">
                    <input type="hidden" name="planId" value={plan.id} />
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold">{plan.name}</p>
                        <p className="text-xs text-muted-foreground">{plan._count.subscriptions} active or historic subscriptions use this plan.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">{formatGhanaCedis(plan.priceGHS)}</Badge>
                        {plan.recommended ? <Badge className="bg-primary text-primary-foreground">Recommended</Badge> : null}
                        <Badge
                          variant={plan.active && !plan.retiredAt ? "secondary" : "outline"}
                          className={plan.active && !plan.retiredAt ? "status-success border" : "status-warning border"}
                        >
                          {plan.active && !plan.retiredAt ? "Checkout on" : "Retired"}
                        </Badge>
                        <Badge variant={plan.visible ? "outline" : "secondary"}>{plan.visible ? "Public" : "Hidden"}</Badge>
                      </div>
                    </div>
                    <div className="grid min-w-0 gap-3 md:grid-cols-2">
                      <Input name="name" defaultValue={plan.name} required />
                      <Input name="priceGHS" type="number" min="0" step="0.01" defaultValue={plan.priceGHS} required />
                      <Input name="maxProducts" type="number" min="1" defaultValue={plan.maxProducts} />
                      <Input name="maxAgents" type="number" min="1" defaultValue={plan.maxAgents} />
                      <Input name="description" defaultValue={plan.description ?? ""} placeholder="Short description" className="md:col-span-2" />
                      <Textarea
                        name="features"
                        defaultValue={parsePlanFeatures(plan.features).join("\n")}
                        placeholder="Feature list, one per line"
                        className="md:col-span-2"
                      />
                      <div className="grid min-w-0 gap-3 text-sm md:col-span-2 lg:grid-cols-3">
                        <label className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                          <input name="active" type="checkbox" defaultChecked={plan.active && !plan.retiredAt} className="h-4 w-4" />
                          <span>Available for checkout</span>
                        </label>
                        <label className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                          <input name="visible" type="checkbox" defaultChecked={plan.visible} className="h-4 w-4" />
                          <span>Show publicly</span>
                        </label>
                        <label className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                          <input name="recommended" type="checkbox" defaultChecked={plan.recommended} className="h-4 w-4" />
                          <span>Recommended badge</span>
                        </label>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-muted-foreground">
                        Keep subscriber count constant at 1 workspace; use products and agents to separate tiers.
                      </p>
                      <Button type="submit" size="sm" className="w-full sm:w-auto">Save Changes</Button>
                    </div>
                  </form>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle>Subscriptions</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0">
            <div className="grid gap-3 xl:hidden lg:grid-cols-2">
              {subscriptions.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No subscription records yet.</p>
              ) : (
                subscriptions.map((subscription) => {
                  const lastPayment = subscription.payments[0]
                  return (
                    <div key={subscription.id} className="rounded-md border bg-background p-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{subscription.organization.name}</p>
                          <p className="font-mono text-xs text-muted-foreground">/{subscription.organization.slug}</p>
                        </div>
                        <Badge
                          variant={subscription.status === "ACTIVE" ? "secondary" : subscription.status === "CANCELED" ? "destructive" : "outline"}
                          className={subscriptionBadgeClass(subscription.status)}
                        >
                          {subscription.status}
                        </Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div>
                          <p className="font-medium text-foreground">{subscription.plan.name}</p>
                          <p>{formatGhanaCedis(subscription.plan.priceGHS)}</p>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {subscription.nextBillingAt ? new Date(subscription.nextBillingAt).toLocaleDateString() : "-"}
                          </p>
                          <p>Next billing</p>
                        </div>
                        <div className="col-span-2">
                          <p className="font-medium text-foreground">
                            {lastPayment ? `${formatGhanaCedis(lastPayment.amount)} ${lastPayment.status}` : "-"}
                          </p>
                          <p>Last payment</p>
                        </div>
                      </div>
                      <form action={updateSubscriptionStatus} className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                        <input type="hidden" name="subscriptionId" value={subscription.id} />
                        <select name="status" defaultValue={subscription.status} className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs">
                          <option value="ACTIVE">ACTIVE</option>
                          <option value="PENDING">PENDING</option>
                          <option value="EXPIRED">EXPIRED</option>
                          <option value="CANCELED">CANCELED</option>
                        </select>
                        <Button type="submit" size="sm" variant="outline">Save</Button>
                      </form>
                      <form action={extendSubscription} className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                        <input type="hidden" name="subscriptionId" value={subscription.id} />
                        <select name="months" defaultValue="1" className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs">
                          <option value="1">Extend 30 days</option>
                          <option value="2">Extend 60 days</option>
                          <option value="3">Extend 90 days</option>
                        </select>
                        <Button type="submit" size="sm">Renew</Button>
                        <input name="customDate" type="date" className="col-span-2 h-9 w-full rounded-md border border-input bg-background px-2 text-xs" />
                      </form>
                    </div>
                  )
                })
              )}
            </div>

            <div className="table-scroll hidden rounded-md border bg-background xl:block">
            <Table className="min-w-[960px] text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Billing</TableHead>
                  <TableHead className="text-right">Control</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      No subscription records yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  subscriptions.map((subscription) => {
                    const lastPayment = subscription.payments[0]
                    return (
                      <TableRow key={subscription.id}>
                        <TableCell>
                          <div className="font-medium">{subscription.organization.name}</div>
                          <div className="font-mono text-xs text-muted-foreground">/{subscription.organization.slug}</div>
                        </TableCell>
                        <TableCell>
                          <div>{subscription.plan.name}</div>
                          <div className="text-xs text-muted-foreground">{formatGhanaCedis(subscription.plan.priceGHS)}</div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={subscription.status === "ACTIVE" ? "secondary" : subscription.status === "CANCELED" ? "destructive" : "outline"}
                            className={subscriptionBadgeClass(subscription.status)}
                          >
                            {subscription.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <div>{subscription.nextBillingAt ? new Date(subscription.nextBillingAt).toLocaleDateString() : "-"}</div>
                          <div className="text-xs">{lastPayment ? `${formatGhanaCedis(lastPayment.amount)} ${lastPayment.status}` : "No payment"}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col gap-2">
                            <form action={updateSubscriptionStatus} className="flex justify-end gap-2">
                              <input type="hidden" name="subscriptionId" value={subscription.id} />
                              <select name="status" defaultValue={subscription.status} className="h-9 rounded-md border border-input bg-background px-2 text-xs">
                                <option value="ACTIVE">ACTIVE</option>
                                <option value="PENDING">PENDING</option>
                                <option value="EXPIRED">EXPIRED</option>
                                <option value="CANCELED">CANCELED</option>
                              </select>
                              <Button type="submit" size="sm" variant="outline">Save</Button>
                            </form>
                            <form action={extendSubscription} className="flex justify-end gap-2">
                              <input type="hidden" name="subscriptionId" value={subscription.id} />
                              <select name="months" defaultValue="1" className="h-9 rounded-md border border-input bg-background px-2 text-xs">
                                <option value="1">30 days</option>
                                <option value="2">60 days</option>
                                <option value="3">90 days</option>
                              </select>
                              <input name="customDate" type="date" className="h-9 rounded-md border border-input bg-background px-2 text-xs" />
                              <Button type="submit" size="sm">Renew</Button>
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
      </div>
    </div>
  )
}
