import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ui/page-header"
import { formatGhanaCedis } from "@/lib/currency"
import { db } from "@/lib/db"
import { createSubscriberTenant, requireSuperAdmin } from "../../_actions"

export const dynamic = "force-dynamic"

export default async function NewBusinessPage() {
  await requireSuperAdmin()
  const plans = await db.plan.findMany({ orderBy: [{ priceGHS: "asc" }, { name: "asc" }], select: { id: true, name: true, priceGHS: true } })

  return (
    <div className="portal-page max-w-3xl space-y-5">
      <PageHeader eyebrow="Businesses" title="Add business" description="Create the owner account and access plan." actions={<Button asChild variant="outline"><Link href="/admin/businesses">Back</Link></Button>} />
      <Card className="premium-surface overflow-hidden rounded-lg">
        <CardHeader className="border-b border-border/70 bg-muted/20"><CardTitle className="text-sm">Business details</CardTitle></CardHeader>
        <CardContent className="p-4 sm:p-5">
          <form action={createSubscriberTenant} className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium">Business name<Input name="orgName" placeholder="Quick Data Ltd" required /></label>
            <label className="space-y-1 text-xs font-medium">Slug<Input name="slug" placeholder="quick-data" /></label>
            <label className="space-y-1 text-xs font-medium">Owner name<Input name="ownerName" placeholder="Owner name" required /></label>
            <label className="space-y-1 text-xs font-medium">Owner email<Input name="ownerEmail" type="email" placeholder="owner@example.com" required /></label>
            <label className="space-y-1 text-xs font-medium">Temporary password<Input name="password" type="password" placeholder="At least 6 characters" required minLength={6} /></label>
            <label className="space-y-1 text-xs font-medium">Plan<select name="planId" required defaultValue={plans[0]?.id ?? ""} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-normal"><option value="" disabled>Select plan</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {formatGhanaCedis(plan.priceGHS)}</option>)}</select></label>
            <label className="space-y-1 text-xs font-medium sm:col-span-2">Access<select name="subscriptionStatus" defaultValue="ACTIVE" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-normal"><option value="ACTIVE">Active</option><option value="PENDING">Pending</option><option value="EXPIRED">Expired</option><option value="CANCELED">Canceled</option><option value="NONE">No subscription</option></select></label>
            <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={plans.length === 0}>Create business</Button><Button asChild type="button" variant="ghost"><Link href="/admin/businesses">Cancel</Link></Button></div>
          </form>
          {plans.length === 0 ? <p className="mt-3 text-xs text-warning">Add a plan before creating a business.</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}
