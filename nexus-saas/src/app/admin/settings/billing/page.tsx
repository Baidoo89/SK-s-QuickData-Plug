import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { EnvStatusCard } from "@/components/admin/env-status-card"

export default function AdminBillingSettingsPage() {
  return <div className="portal-page max-w-4xl space-y-5"><PageHeader eyebrow="Settings" title="Billing" description="Platform billing and key encryption." actions={<Button asChild variant="outline"><Link href="/admin/settings">Back</Link></Button>} /><div className="grid gap-3 sm:grid-cols-2"><EnvStatusCard label="Platform Paystack" envKey="PAYSTACK_SUBSCRIPTION_SECRET_KEY" description="SaaS subscription billing." /><EnvStatusCard label="Subscriber encryption" envKey="PAYMENT_SETTINGS_ENCRYPTION_KEY" description="Encrypts stored payment settings." /></div></div>
}
