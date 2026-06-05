import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { SignupApprovalActions } from "@/components/admin/signup-approval-actions"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const dynamic = "force-dynamic"

export default async function AdminApprovalsPage() {
  const session = await auth()
  if (!session?.user?.email) {
    redirect("/login")
  }

  const currentUser = await db.user.findUnique({
    where: { email: session.user.email },
    select: { role: true, organizationId: true },
  })

  if (currentUser?.role !== "SUPERADMIN") {
    redirect("/admin")
  }

  const pendingAgents = await db.user.findMany({
    where: {
      role: "AGENT",
      signupStatus: "PENDING",
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      active: true,
      signupStatus: true,
      agent: { select: { id: true, name: true, commissionPercent: true, active: true } },
      organization: { select: { name: true, slug: true, active: true } },
    },
  })

  return (
    <div className="portal-page space-y-6">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Access governance</p>
        <h1 className="text-2xl font-bold tracking-tight">Signup Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Review pending agent signup requests across all tenants. Reseller approval remains under agent/subscriber operations.
        </p>
      </div>

      <Card className="border border-border bg-card/95">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3 text-base">
            Pending agents
            <Badge variant="secondary">{pendingAgents.length}</Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Agent requests are approved here. Reseller requests remain under each agent in the agent portal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pendingAgents.length === 0 ? (
            <div className="rounded-md border border-dashed bg-muted/25 px-4 py-6 text-sm text-muted-foreground">
              No pending agent requests.
            </div>
          ) : (
            pendingAgents.map((agentUser) => (
              <div
                key={agentUser.id}
                className="flex flex-col gap-3 rounded-md border border-border bg-background p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold text-foreground">{agentUser.name ?? "Unnamed agent"}</p>
                  <p className="break-all text-sm text-muted-foreground">{agentUser.email ?? "-"}</p>
                  <p className="text-xs text-muted-foreground">{agentUser.organization?.name ?? "No organization"}</p>
                  <p className="text-xs text-muted-foreground">Requested {new Date(agentUser.createdAt).toLocaleString()}</p>
                </div>
                <SignupApprovalActions
                  kind="agent"
                  id={agentUser.agent?.id ?? agentUser.id}
                  agentName={agentUser.agent?.name ?? agentUser.name ?? "Agent"}
                  commissionPercent={agentUser.agent?.commissionPercent ?? 0}
                  label="Approve agent"
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
