import { db } from "@/lib/db";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function AdminSystemPage() {
  const [orgCount, userCount, orderCount, productCount, agentCount, auditLogs] = await Promise.all([
    db.organization.count(),
    db.user.count(),
    db.order.count(),
    db.product.count(),
    db.agent.count(),
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { organization: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold tracking-tight">System</h2>
      <p className="text-sm text-muted-foreground">
        View notifications, complaints, and system logs across the platform.
      </p>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        {[
          { label: "Organizations", value: orgCount },
          { label: "Users", value: userCount },
          { label: "Orders", value: orderCount },
          { label: "Products", value: productCount },
          { label: "Agents", value: agentCount },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Audit Logs</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-hidden p-0">
          <div className="w-full max-w-full overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No audit logs found.
                    </TableCell>
                  </TableRow>
                ) : (
                  auditLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <Badge variant="outline" className="text-xs font-mono">
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{log.actorName ?? log.actorId ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {log.targetType}/{log.targetId.slice(0, 8)}…
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.organization?.name ?? "—"}
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
  );
}
