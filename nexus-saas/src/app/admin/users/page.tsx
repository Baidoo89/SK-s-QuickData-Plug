import { db } from "@/lib/db";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";

const ROLE_COLORS: Record<string, string> = {
  SUPERADMIN: "bg-red-100 text-red-800",
  SUBSCRIBER: "bg-blue-100 text-blue-800",
  AGENT: "bg-yellow-100 text-yellow-800",
  RESELLER: "bg-green-100 text-green-800",
};

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: "ADMIN",
  SUBSCRIBER: "ADMIN",
  AGENT: "AGENT",
  RESELLER: "RESELLER",
};

export default async function AdminUsersPage() {
  const [users, roleCounts] = await Promise.all([
    db.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
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
  ]);

  const countByRole = Object.fromEntries(
    roleCounts.map((r: { role: string; _count: { role: number } }) => [r.role, r._count.role])
  );

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold tracking-tight">Users</h2>
      <p className="text-sm text-muted-foreground">
        Central place to manage all users, agents, resellers, and suspended accounts.
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        {(["SUBSCRIBER", "AGENT", "RESELLER"] as const).map((role) => (
          <Card key={role}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{ROLE_LABELS[role]}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{countByRole[role] ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User Directory</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-hidden p-0">
          <div className="w-full max-w-full overflow-x-auto">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No users found.
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user: {
                    id: string;
                    name: string | null;
                    email: string | null;
                    role: string;
                    createdAt: Date;
                    organization: { name: string } | null;
                  }) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{user.email ?? "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`text-xs ${ROLE_COLORS[user.role] ?? "bg-gray-100 text-gray-700"}`}
                        >
                          {ROLE_LABELS[user.role] ?? user.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {user.organization?.name ?? "—"}
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
  );
}
