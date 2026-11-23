import { ShieldCheck, UserCheck, Users } from "lucide-react"

import { db } from "@/lib/db"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MetricCard } from "@/components/ui/metric-card"
import { PageHeader } from "@/components/ui/page-header"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const ROLE_COLORS: Record<string, string> = {
  SUPERADMIN: "border-destructive/20 bg-destructive/10 text-destructive",
  SUBSCRIBER: "border-primary/20 bg-primary/10 text-primary",
  AGENT: "border-warning/20 bg-warning/10 text-warning",
  RESELLER: "border-success/20 bg-success/10 text-success",
}

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: "Platform admin",
  SUBSCRIBER: "Owner",
  AGENT: "Agent",
  RESELLER: "Reseller",
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
    <div className="portal-page space-y-5">
      <PageHeader eyebrow="People" title="Users" description="All platform accounts." />

      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
        <MetricCard label="Users" value={totalUserCount} description={`${activeUserCount} active · ${suspendedUserCount} suspended`} icon={Users} tone="primary" />
        <MetricCard label="Owners" value={countByRole.SUBSCRIBER ?? 0} description="Business owners" icon={ShieldCheck} tone="info" />
        <MetricCard label="Sellers" value={(countByRole.AGENT ?? 0) + (countByRole.RESELLER ?? 0)} description={`${countByRole.AGENT ?? 0} agents · ${countByRole.RESELLER ?? 0} resellers`} icon={UserCheck} tone="success" />
        <MetricCard label="Pending" value={pendingUserCount} description="Needs approval" icon={UserCheck} tone={pendingUserCount > 0 ? "warning" : "muted"} />
      </div>

      <Card className="premium-surface overflow-hidden rounded-lg">
        <CardHeader className="border-b border-border/70 bg-muted/20"><CardTitle className="text-sm">User list</CardTitle></CardHeader>
        <CardContent className="overflow-x-hidden p-0">
          <div className="divide-y md:hidden">
            {users.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No users found.</p>
            ) : (
              users.map((user) => (
                <div key={user.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{user.name ?? "Unnamed"}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.email ?? "-"}</p>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">{user.organization?.name ?? "Platform"}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant="outline" className={`text-[11px] ${ROLE_COLORS[user.role] ?? ""}`}>{ROLE_LABELS[user.role] ?? user.role}</Badge>
                    <Badge variant={user.active && user.signupStatus === "APPROVED" ? "secondary" : "outline"} className={`text-[11px] ${user.active && user.signupStatus === "APPROVED" ? "status-success border" : "status-warning border"}`}>{user.active ? user.signupStatus : "Suspended"}</Badge>
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
