import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { EnvStatusCard } from "@/components/admin/env-status-card"

export default function AdminEmailSettingsPage() {
  return <div className="portal-page max-w-4xl space-y-5"><PageHeader eyebrow="Settings" title="Email" description="Transactional email delivery." actions={<Button asChild variant="outline"><Link href="/admin/settings">Back</Link></Button>} /><div className="grid gap-3 sm:grid-cols-2"><EnvStatusCard label="Resend API key" envKey="RESEND_API_KEY" description="Sends account and invite email." /><EnvStatusCard label="From address" envKey="RESEND_FROM_EMAIL" description="Verified sender address." /></div></div>
}
