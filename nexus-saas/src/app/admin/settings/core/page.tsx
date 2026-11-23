import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { EnvStatusCard } from "@/components/admin/env-status-card"

export default function AdminCoreSettingsPage() {
  return <div className="portal-page max-w-4xl space-y-5"><PageHeader eyebrow="Settings" title="Core" description="Auth, URL, and database." actions={<Button asChild variant="outline"><Link href="/admin/settings">Back</Link></Button>} /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><EnvStatusCard label="Auth secret" envKey="NEXTAUTH_SECRET" description="Session signing key." /><EnvStatusCard label="App URL" envKey="NEXTAUTH_URL" description="Callback and link URL." /><EnvStatusCard label="Database" envKey="DATABASE_URL" description="Production database connection." /></div></div>
}
