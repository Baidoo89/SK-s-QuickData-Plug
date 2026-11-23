import Link from "next/link"
import { Activity } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { EnvStatusCard } from "@/components/admin/env-status-card"
import { DispatchHealthCard } from "@/components/admin/dispatch-health-card"

export default function AdminMonitoringSettingsPage() {
  return <div className="portal-page max-w-5xl space-y-5"><PageHeader eyebrow="Settings" title="Monitoring" description="Dispatch health and alert thresholds." actions={<Button asChild variant="outline"><Link href="/admin/settings">Back</Link></Button>} /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><EnvStatusCard label="Retry attempts" envKey="DISPATCH_RETRY_MAX_ATTEMPTS" /><EnvStatusCard label="Retry backoff" envKey="DISPATCH_RETRY_BACKOFF_SECONDS" /><EnvStatusCard label="Pending age" envKey="DISPATCH_HEALTH_PENDING_AGE_MINUTES" /><EnvStatusCard label="Failed alert" envKey="DISPATCH_HEALTH_ALERT_FAIL_THRESHOLD" /><EnvStatusCard label="Stale alert" envKey="DISPATCH_HEALTH_ALERT_STALE_THRESHOLD" /></div><div className="grid gap-3 md:grid-cols-2"><div className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/20 p-4"><Activity className="h-5 w-5 text-primary" /><div><p className="text-sm font-semibold">Live dispatch health</p><p className="text-xs text-muted-foreground">Current queue signal.</p></div></div><DispatchHealthCard /></div></div>
}
