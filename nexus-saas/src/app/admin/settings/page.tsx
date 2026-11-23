import Link from "next/link"
import { Activity, CreditCard, Mail, Rocket, ServerCog, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"

const sections = [
  { href: "/admin/settings/core", label: "Core", detail: "Auth, URL, database", icon: ShieldCheck },
  { href: "/admin/settings/billing", label: "Billing", detail: "Paystack and encryption", icon: CreditCard },
  { href: "/admin/settings/email", label: "Email", detail: "Transactional email", icon: Mail },
  { href: "/admin/settings/provider", label: "Provider", detail: "Order routing and webhooks", icon: Rocket },
  { href: "/admin/settings/monitoring", label: "Monitoring", detail: "Dispatch health and thresholds", icon: Activity },
]

export default function AdminSettingsPage() {
  return (
    <div className="portal-page max-w-4xl space-y-5">
      <PageHeader eyebrow="Platform" title="Settings" description="Choose a configuration area." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map(({ href, label, detail, icon: Icon }) => (
          <Link key={href} href={href} className="group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:bg-muted/30">
              <CardContent className="flex items-center gap-3 p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/5 text-primary"><Icon className="h-4 w-4" /></span>
                <span className="min-w-0"><span className="block text-sm font-semibold">{label}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{detail}</span></span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <Card className="border-border/70 bg-muted/20"><CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">Need platform status?</p><p className="text-xs text-muted-foreground">View readiness and audit activity.</p></div><Button asChild size="sm" variant="outline"><Link href="/admin/system"><ServerCog className="mr-2 h-4 w-4" />Open health</Link></Button></CardContent></Card>
    </div>
  )
}
