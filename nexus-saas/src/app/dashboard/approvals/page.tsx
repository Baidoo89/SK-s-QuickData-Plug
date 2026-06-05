import { auth } from "@/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { SignupApprovalActions } from "@/components/admin/signup-approval-actions"
import { AlertTriangle, CheckCircle2, Clock, Mail, Phone, ShieldCheck, UserRound } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function DashboardApprovalsPage() {
  const session = await auth()
  if (!session?.user?.email) {
    redirect("/login")
  }

  const currentUser = await db.user.findUnique({
    where: { email: session.user.email },
    select: { role: true, organizationId: true },
  })

  if (currentUser?.role !== "SUBSCRIBER" || !currentUser.organizationId) {
    redirect("/dashboard")
  }

  const pendingAgents = await db.user.findMany({
    where: {
      role: "AGENT",
      signupStatus: "PENDING",
      organizationId: currentUser.organizationId,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      emailVerificationRequired: true,
      phoneNumber: true,
      phoneVerified: true,
      createdAt: true,
      active: true,
      signupStatus: true,
      agent: { select: { id: true, name: true, commissionPercent: true, active: true } },
      organization: { select: { name: true, slug: true, active: true } },
    },
  })

  return (
    <div className="portal-page space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Approvals</h1>
          <p className="text-sm text-muted-foreground">
            Review agent signup requests, check contact verification, then approve or reject access.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[420px]">
          <div className="rounded-md border bg-background px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="font-semibold">{pendingAgents.length}</p>
          </div>
          <div className="rounded-md border bg-background px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Email verified</p>
            <p className="font-semibold">{pendingAgents.filter((user) => user.emailVerified).length}</p>
          </div>
          <div className="rounded-md border bg-background px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Phone verified</p>
            <p className="font-semibold">{pendingAgents.filter((user) => user.phoneVerified).length}</p>
          </div>
        </div>
      </div>

      <Card className="border border-border bg-card/95">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Pending agents
            <Badge variant="secondary">{pendingAgents.length}</Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Agent requests are approved here. Reseller requests are approved by agents in the agent portal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pendingAgents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending agent requests.</p>
          ) : (
            pendingAgents.map((agentUser) => (
              <div key={agentUser.id} className="grid gap-4 rounded-lg border border-border bg-background p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-semibold text-foreground">
                        <UserRound className="h-4 w-4 text-primary" />
                        {agentUser.name ?? "Unnamed agent"}
                      </p>
                      <p className="mt-1 break-all text-sm text-muted-foreground">{agentUser.email ?? "-"}</p>
                    </div>
                    <Badge variant="outline" className="w-fit">
                      <Clock className="mr-1 h-3 w-3" />
                      Pending
                    </Badge>
                  </div>

                  <div className="grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
                    <div className={agentUser.emailVerified ? "status-success rounded-md border px-3 py-2" : "status-warning rounded-md border px-3 py-2"}>
                      <p className="flex items-center gap-1 font-semibold">
                        {agentUser.emailVerified ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                        Email
                      </p>
                      <p className="mt-1">{agentUser.emailVerified ? "Verified" : "Not verified yet"}</p>
                    </div>
                    <div className={agentUser.phoneVerified ? "status-success rounded-md border px-3 py-2" : "rounded-md border bg-muted/30 px-3 py-2 text-muted-foreground"}>
                      <p className="flex items-center gap-1 font-semibold">
                        <Phone className="h-3.5 w-3.5" />
                        Phone
                      </p>
                      <p className="mt-1">{agentUser.phoneNumber ? agentUser.phoneNumber : "Not provided"}{agentUser.phoneVerified ? " verified" : ""}</p>
                    </div>
                    <div className="rounded-md border bg-muted/30 px-3 py-2 text-muted-foreground">
                      <p className="flex items-center gap-1 font-semibold">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Organization
                      </p>
                      <p className="mt-1 truncate">{agentUser.organization?.name ?? "No organization"}</p>
                    </div>
                    <div className="rounded-md border bg-muted/30 px-3 py-2 text-muted-foreground">
                      <p className="flex items-center gap-1 font-semibold">
                        <Mail className="h-3.5 w-3.5" />
                        Requested
                      </p>
                      <p className="mt-1">{new Date(agentUser.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>

                  {!agentUser.emailVerified && (
                    <p className="text-xs text-amber-700">
                      This agent can be approved, but login remains blocked until email verification is complete.
                    </p>
                  )}
                </div>
                <SignupApprovalActions
                  kind="agent"
                  id={agentUser.agent?.id ?? agentUser.id}
                  agentName={agentUser.agent?.name ?? agentUser.name ?? "Agent"}
                  commissionPercent={agentUser.agent?.commissionPercent ?? 0}
                  label="Approve agent"
                  verificationWarning={!agentUser.emailVerified ? "Email is not verified yet." : undefined}
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
