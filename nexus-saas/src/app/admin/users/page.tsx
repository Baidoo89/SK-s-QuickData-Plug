import { ShieldCheck, UserCheck, Users } from "lucide-react"

import { db } from "@/lib/db"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MetricCard } from "@/components/ui/metric-card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const ROLE_COLORS: Record<string, string> = {
  SUPERADMIN: "border-destructive/20 bg-destructive/10 text-destructive",
  SUBSCRIBER: "border-primary/20 bg-primary/10 text-primary",
  AGENT: "border-warning/20 bg-warning/10 text-warning",
  RESELLER: "border-success/20 bg-success/10 text-success",
}

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: "SUPERADMIN",
  SUBSCRIBER: "SUBSCRIBER",
  AGENT: "AGENT",
  RESELLER: "RESELLER",
}

export default async function AdminUsersPage() {
  const [users, roleCounts, activeUserCount, suspendedUserCount, pendingUserCount] = await Promise.all([
    db.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        signupStatus: true,
        createdAt: true,
        organization: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.user.groupBy({
      by: ["role"],
      _count: { role: true },
    }),
    db.user.count({ where: { active: true } }),
    db.user.count({ where: { active: false } }),
    db.user.count({ where: { signupStatus: "PENDING" } }),
  ])

  const countByRole = Object.fromEntries(
    roleCounts.map((row: { role: string; _count: { role: number } }) => [row.role, row._count.role]),
  )
  const totalUserCount = Object.values(countByRole).reduce((sum, count) => sum + Number(count), 0)

  return (
    <div className="portal-page space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Access governance</p>
        <h2 className="text-2xl font-bold tracking-tight">User Directory</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Platform-wide identity oversight for tenant owners, agents, resellers, and platform operators. Use this page to verify ownership, approval state, and account risk.
        </p>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard label="Total Users" value={totalUserCount} description={`${activeUserCount} active accounts`} icon={Users} tone="primary" />
        <MetricCard label="Platform Operators" value={countByRole.SUPERADMIN ?? 0} description="SaaS owner access" icon={ShieldCheck} tone="muted" />
        <MetricCard label="Subscribers" value={countByRole.SUBSCRIBER ?? 0} description="Tenant owner accounts" icon={ShieldCheck} tone="info" />
        <MetricCard label="Agents" value={countByRole.AGENT ?? 0} description="Agent operator accounts" icon={UserCheck} tone="warning" />
        <MetricCard label="Resellers" value={countByRole.RESELLER ?? 0} description="Downline seller accounts" icon={UserCheck} tone="success" />
        <MetricCard label="Pending" value={pendingUserCount} description="Accounts waiting approval" icon={UserCheck} tone={pendingUserCount > 0 ? "warning" : "muted"} />
        <MetricCard label="Suspended" value={suspendedUserCount} description="Inactive accounts" icon={ShieldCheck} tone={suspendedUserCount > 0 ? "warning" : "muted"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Latest Identity Records</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Recent accounts across every organization. Approval actions live on the signup approvals page; tenant suspension lives on Tenant Control.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-hidden p-0">
          <div className="space-y-3 p-4 md:hidden">
            {users.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No users found.</p>
            ) : (
              users.map((user) => (
                <div key={user.id} className="rounded-lg border border-border/70 bg-background/80 p-3 text-sm shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{user.name ?? "Unnamed"}</p>
                      <p className="break-all text-xs text-muted-foreground">{user.email ?? "-"}</p>
                    </div>
                    <Badge variant="outline" className={`shrink-0 text-xs ${ROLE_COLORS[user.role] ?? ""}`}>
                      {ROLE_LABELS[user.role] ?? user.role}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge
                      variant={user.active && user.signupStatus === "APPROVED" ? "secondary" : "outline"}
                      className={user.active && user.signupStatus === "APPROVED" ? "status-success border" : "status-warning border"}
                    >
                      {user.active ? user.signupStatus : "SUSPENDED"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{user.organization?.name ?? "Platform"}</span>
                    <span className="text-xs text-muted-foreground">{new Date(user.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="table-scroll hidden md:block">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No users found.
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name ?? "Unnamed"}</TableCell>
                      <TableCell className="break-all text-sm text-muted-foreground">{user.email ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${ROLE_COLORS[user.role] ?? ""}`}>
                          {ROLE_LABELS[user.role] ?? user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={user.active && user.signupStatus === "APPROVED" ? "secondary" : "outline"}
                          className={user.active && user.signupStatus === "APPROVED" ? "status-success border" : "status-warning border"}
                        >
                          {user.active ? user.signupStatus : "SUSPENDED"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {user.organization?.name ?? "Platform"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
