import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { EnvStatusCard } from "@/components/admin/env-status-card"

export default function AdminProviderSettingsPage() {
  return <div className="portal-page max-w-5xl space-y-5"><PageHeader eyebrow="Settings" title="Provider" description="Order routing and webhooks." actions={<Button asChild variant="outline"><Link href="/admin/settings">Back</Link></Button>} /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><EnvStatusCard label="Order URL" envKey="PROVIDER_ORDER_URL" /><EnvStatusCard label="API key" envKey="PROVIDER_API_KEY" /><EnvStatusCard label="Webhook secret" envKey="PROVIDER_WEBHOOK_SECRET" /><EnvStatusCard label="Webhook HMAC" envKey="PROVIDER_WEBHOOK_HMAC_SECRET" /></div></div>
}
