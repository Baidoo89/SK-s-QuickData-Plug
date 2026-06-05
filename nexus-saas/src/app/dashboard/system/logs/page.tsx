import { auth } from "@/auth"
import { db } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export const dynamic = "force-dynamic"

export default async function DashboardLogsPage() {
  const session = await auth()
  const user = session?.user?.email
    ? await db.user.findUnique({
        where: { email: session.user.email },
        select: { organizationId: true },
      })
    : null

  const logs = user?.organizationId
    ? await db.auditLog.findMany({
        where: { organizationId: user.organizationId },
        orderBy: { createdAt: "desc" },
        take: 50,
      })
    : []

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Logs</h1>
        <p className="text-sm text-muted-foreground">
          Recent audit activity for your organization.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit trail</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 xl:hidden lg:grid-cols-2">
            {logs.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No audit logs found.</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="rounded-md border bg-background p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {log.action}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">{new Date(log.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <p className="truncate font-medium text-foreground">{log.actorName ?? log.actorId ?? "-"}</p>
                      <p>Actor</p>
                    </div>
                    <div>
                      <p className="font-mono text-[11px] text-foreground">{log.targetType}/{log.targetId.slice(0, 8)}</p>
                      <p>Target</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="table-scroll hidden rounded-md border bg-background xl:block">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    No audit logs found.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs">{log.action}</TableCell>
                    <TableCell className="text-sm">{log.actorName ?? log.actorId ?? "-"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {log.targetType}/{log.targetId.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString()}
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
