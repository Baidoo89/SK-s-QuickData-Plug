import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowRight, CheckCircle2, ClipboardCheck, Network, ShieldCheck, Users, UserRound } from "lucide-react"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import { PortalAccessMessage } from "@/components/access/portal-access-message"

export const dynamic = "force-dynamic"

type TeamLinkCardProps = {
  href: string
  label: string
  value: number
  detail: string
  icon: typeof Users
  tone?: "primary" | "success" | "warning"
}

const toneClasses = {
  primary: "border-primary/20 bg-primary/5 text-primary",
  success: "border-success/20 bg-success/5 text-success",
  warning: "border-warning/20 bg-warning/5 text-warning",
}

function TeamLinkCard({ href, label, value, detail, icon: Icon, tone = "primary" }: TeamLinkCardProps) {
  return (
    <Link href={href} className="group block min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className="h-full border-border/75 bg-card/95 transition-colors hover:border-primary/35 hover:bg-muted/30">
        <CardContent className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${toneClasses[tone]}`}>
                <Icon className="h-4 w-4" />
              </span>
              <p className="font-semibold text-foreground">{label}</p>
            </div>
            <p className="mt-4 text-2xl font-bold tracking-tight text-foreground">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </div>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </CardContent>
      </Card>
    </Link>
  )
}

export default async function TeamPage() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  const currentUser = await db.user.findUnique({
    where: { email: session.user.email },
    select: { role: true, organizationId: true, organization: { select: { name: true } } },
  })

  if (currentUser?.role !== "SUBSCRIBER" || !currentUser.organizationId) {
    return <PortalAccessMessage title="Team unavailable" description="This workspace is not linked to an organization team yet." />
  }

  const organizationId = currentUser.organizationId
  const [agentCount, activeAgentCount, resellerCount, activeResellerCount, pendingAgentCount, directoryCount] = await Promise.all([
    db.agent.count({ where: { organizationId } }),
    db.agent.count({ where: { organizationId, active: true } }),
    db.user.count({ where: { organizationId, role: "RESELLER" } }),
    db.user.count({ where: { organizationId, role: "RESELLER", active: true, signupStatus: "APPROVED" } }),
    db.user.count({ where: { organizationId, role: "AGENT", signupStatus: "PENDING" } }),
    db.user.count({ where: { organizationId, role: { in: ["SUBSCRIBER", "AGENT", "RESELLER"] } } }),
  ])

  return (
    <div className="portal-page flex flex-col gap-6">
      <PageHeader
        eyebrow="Workspace"
        title="Team"
        description={currentUser.organization?.name ? `${currentUser.organization.name} team` : "People who sell through your business"}
        actions={<Button asChild><Link href="/dashboard/agents">Add agent</Link></Button>}
      />

      <Card className="border-border/75 bg-card/95">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Network className="h-4 w-4 text-primary" />
            Team structure
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <div className="flex-1 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" />Store owner</div>
              <p className="mt-1 text-xs text-muted-foreground">Controls pricing, wallets, and access</p>
            </div>
            <div className="hidden items-center px-1 text-center text-muted-foreground sm:flex">→</div>
            <div className="flex-1 rounded-lg border border-border/75 bg-background/70 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-foreground" />Agents</div>
              <p className="mt-1 text-xs text-muted-foreground">Sell and manage their resellers</p>
            </div>
            <div className="hidden items-center px-1 text-center text-muted-foreground sm:flex">→</div>
            <div className="flex-1 rounded-lg border border-border/75 bg-background/70 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold"><UserRound className="h-4 w-4 text-foreground" />Resellers</div>
              <p className="mt-1 text-xs text-muted-foreground">Sell with agent pricing</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TeamLinkCard href="/dashboard/agents" label="Agents" value={agentCount} detail={`${activeAgentCount} active`} icon={Users} tone="primary" />
        <TeamLinkCard href="/dashboard/users/resellers" label="Resellers" value={resellerCount} detail={`${activeResellerCount} active`} icon={UserRound} tone="success" />
        <TeamLinkCard href="/dashboard/approvals" label="Approvals" value={pendingAgentCount} detail={pendingAgentCount === 1 ? "agent waiting" : "agents waiting"} icon={ClipboardCheck} tone={pendingAgentCount > 0 ? "warning" : "success"} />
        <TeamLinkCard href="/dashboard/users" label="Directory" value={directoryCount} detail="internal accounts" icon={CheckCircle2} tone="primary" />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <Link href="/dashboard/approvals" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Review approvals <ArrowRight className="h-3.5 w-3.5" /></Link>
        <Link href="/dashboard/users" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Open directory <ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>
    </div>
  )
}
