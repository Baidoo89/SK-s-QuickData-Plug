import { auth } from "@/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { ShieldCheck, UserCheck, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatGhanaCedis } from "@/lib/currency";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { PortalAccessMessage } from "@/components/access/portal-access-message";

const ROLE_COLORS: Record<string, string> = {
  SUBSCRIBER: "border-primary/20 bg-primary/10 text-primary",
  AGENT: "border-warning/20 bg-warning/10 text-warning",
  RESELLER: "border-success/20 bg-success/10 text-success",
};

const ROLE_LABELS: Record<string, string> = {
  SUBSCRIBER: "ADMIN",
  AGENT: "AGENT",
  RESELLER: "RESELLER",
};

type RoleFilter = "all" | "SUBSCRIBER" | "AGENT" | "RESELLER";
type SortOption = "joined_desc" | "wallet_desc" | "orders_desc";

export default async function DashboardUsersPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/login");
  }

  const qRaw = typeof searchParams?.q === "string" ? searchParams.q.trim() : "";
  const q = qRaw.slice(0, 80);
  const qLower = q.toLowerCase();
  const qDigits = q.replace(/\D/g, "");

  const roleParam = typeof searchParams?.role === "string" ? searchParams.role : "all";
  const roleFilter: RoleFilter =
    roleParam === "SUBSCRIBER" || roleParam === "AGENT" || roleParam === "RESELLER"
      ? roleParam
      : "all";

  const sortParam = typeof searchParams?.sort === "string" ? searchParams.sort : "joined_desc";
  const sort: SortOption =
    sortParam === "wallet_desc" || sortParam === "orders_desc" ? sortParam : "joined_desc";

  const me = await db.user.findUnique({
    where: { email: session.user.email },
    select: { organizationId: true },
  });

  if (!me?.organizationId) {
    return <PortalAccessMessage title="Organization unavailable" description="This account is not linked to an organization directory yet." />;
  }

  const [users, roleCounts] = await Promise.all([
    db.user.findMany({
      where: {
        organizationId: me.organizationId,
        role: { in: ["SUBSCRIBER", "AGENT", "RESELLER"] },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        agentId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.user.groupBy({
      by: ["role"],
      where: {
        organizationId: me.organizationId,
        role: { in: ["SUBSCRIBER", "AGENT", "RESELLER"] },
      },
      _count: { role: true },
    }),
  ]);

  const userIds = users.map((u) => u.id);
  const agentIds = users
    .map((u) => u.agentId)
    .filter((id): id is string => Boolean(id));

  const [walletSums, resellerOrderCounts, agentOrderCounts] = await Promise.all([
    db.walletTransaction.groupBy({
      by: ["userId"],
      where: {
        userId: { in: userIds },
      },
      _sum: { amount: true },
    }),
    db.order.groupBy({
      by: ["userId"],
      where: {
        organizationId: me.organizationId,
        userId: { in: userIds },
      },
      _count: { _all: true },
    }),
    db.order.groupBy({
      by: ["agentId"],
      where: {
        organizationId: me.organizationId,
        agentId: { in: agentIds },
      },
      _count: { _all: true },
    }),
  ]);

  const walletByUserId = new Map(
    walletSums
      .filter((row) => row.userId)
      .map((row) => [row.userId as string, row._sum.amount ?? 0])
  );

  const ordersByUserId = new Map(
    resellerOrderCounts
      .filter((row) => row.userId)
      .map((row) => [row.userId as string, row._count._all])
  );

  const ordersByAgentId = new Map(
    agentOrderCounts
      .filter((row) => row.agentId)
      .map((row) => [row.agentId as string, row._count._all])
  );

  const [resellerPhoneMatches, agentPhoneMatches] = qDigits
    ? await Promise.all([
        db.order.findMany({
          where: {
            organizationId: me.organizationId,
            userId: { in: userIds },
            phoneNumber: { contains: qDigits },
          },
          select: { userId: true },
          distinct: ["userId"],
        }),
        db.order.findMany({
          where: {
            organizationId: me.organizationId,
            agentId: { in: agentIds },
            phoneNumber: { contains: qDigits },
          },
          select: { agentId: true },
          distinct: ["agentId"],
        }),
      ])
    : [[], []];

  const resellerPhoneMatchSet = new Set(
    resellerPhoneMatches
      .map((row) => row.userId)
      .filter((id): id is string => Boolean(id))
  );

  const agentPhoneMatchSet = new Set(
    agentPhoneMatches
      .map((row) => row.agentId)
      .filter((id): id is string => Boolean(id))
  );

  const countByRole = Object.fromEntries(
    roleCounts.map((r: { role: string; _count: { role: number } }) => [r.role, r._count.role])
  );

  const [profiles, assignments] = await Promise.all([
    db.pricingProfile.findMany({
      where: { organizationId: me.organizationId },
      select: {
        id: true,
        name: true,
        tag: true,
        targetRole: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    db.userPricingProfileAssignment.findMany({
      where: {
        organizationId: me.organizationId,
        userId: { in: userIds },
      },
      select: {
        userId: true,
        pricingProfileId: true,
        strictPricing: true,
      },
    }),
  ]);

  const assignmentByUserId = new Map(assignments.map((a) => [a.userId, a]));

  const rows = users.map((u) => {
    const walletBalance = walletByUserId.get(u.id) ?? 0;
    const totalOrders = u.role === "AGENT" ? ordersByAgentId.get(u.agentId ?? "") ?? 0 : ordersByUserId.get(u.id) ?? 0;
    const phoneMatch = u.role === "AGENT" ? agentPhoneMatchSet.has(u.agentId ?? "") : resellerPhoneMatchSet.has(u.id);

    return {
      ...u,
      walletBalance,
      totalOrders,
      phoneMatch,
    };
  });

  const filteredRows = rows
    .filter((row) => {
      if (roleFilter !== "all" && row.role !== roleFilter) {
        return false;
      }

      if (!qLower) {
        return true;
      }

      const nameMatch = (row.name ?? "").toLowerCase().includes(qLower);
      const emailMatch = (row.email ?? "").toLowerCase().includes(qLower);
      const phoneMatch = qDigits.length > 0 && row.phoneMatch;
      const numericMatch =
        qDigits.length > 0 &&
        (String(row.totalOrders).includes(qDigits) || Math.round(row.walletBalance).toString().includes(qDigits));

      return nameMatch || emailMatch || phoneMatch || numericMatch;
    })
    .sort((a, b) => {
      if (sort === "wallet_desc") {
        return b.walletBalance - a.walletBalance;
      }
      if (sort === "orders_desc") {
        return b.totalOrders - a.totalOrders;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  return (
    <div className="portal-page flex flex-col gap-6 md:gap-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold mb-1">All Users</h1>
        <p className="text-muted-foreground max-w-xl">
          Unified directory for admin, agents, and resellers in your organization.
        </p>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-3">
        <MetricCard label="Admins" value={countByRole.SUBSCRIBER ?? 0} description="Subscriber owner accounts in this organization" icon={ShieldCheck} tone="primary" />
        <MetricCard label="Agents" value={countByRole.AGENT ?? 0} description="Approved and pending agent accounts" icon={Users} tone="warning" />
        <MetricCard label="Resellers" value={countByRole.RESELLER ?? 0} description="Reseller accounts connected to agents" icon={UserCheck} tone="success" />
      </div>

      <Card className="premium-surface overflow-hidden rounded-lg">
        <CardHeader className="border-b border-border/70 bg-muted/20">
          <CardTitle>User Directory</CardTitle>
          <CardDescription>
            All internal users under this subscriber account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="GET" className="mb-4 grid gap-2 md:grid-cols-[1fr_180px_180px_auto]">
            <Input
              name="q"
              defaultValue={q}
              placeholder="Search by name, email, or number"
            />
            <select
              name="role"
              defaultValue={roleFilter}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All roles</option>
              <option value="SUBSCRIBER">Admin</option>
              <option value="AGENT">Agents</option>
              <option value="RESELLER">Resellers</option>
            </select>
            <select
              name="sort"
              defaultValue={sort}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="joined_desc">Newest first</option>
              <option value="wallet_desc">Highest balance</option>
              <option value="orders_desc">Highest orders</option>
            </select>
            <Button type="submit">Apply</Button>
          </form>

          <div className="grid gap-3 xl:hidden lg:grid-cols-2">
            {filteredRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No users match your filters.</p>
            ) : (
              filteredRows.map((u) => {
                const assignment = assignmentByUserId.get(u.id)
                const assignedProfileId = assignment?.pricingProfileId ?? ""
                const strictPricing = assignment?.strictPricing ?? false
                const profileOptions = profiles.filter((p) => p.targetRole === "BOTH" || p.targetRole === u.role)
                const roleCanAssign = u.role === "AGENT" || u.role === "RESELLER"
                return (
                  <div key={u.id} className="rounded-lg border border-border/70 bg-background/80 p-3 text-sm shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{u.name ?? "Unnamed"}</p>
                        <p className="break-all text-xs text-muted-foreground">{u.email ?? "-"}</p>
                      </div>
                      <Badge variant="secondary" className={`text-xs ${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-700"}`}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div>
                        <p className="font-semibold text-foreground">{formatGhanaCedis(u.walletBalance)}</p>
                        <p>Wallet</p>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{u.totalOrders}</p>
                        <p>Orders</p>
                      </div>
                      <div className="col-span-2">
                        <p className="font-medium text-foreground">{new Date(u.createdAt).toLocaleDateString()}</p>
                        <p>Joined</p>
                      </div>
                    </div>
                    {roleCanAssign ? (
                      <form method="POST" action="/api/pricing/profiles/assign" className="mt-3 grid gap-2">
                        <input type="hidden" name="userId" value={u.id} />
                        <input
                          type="hidden"
                          name="returnTo"
                          value={`/dashboard/users?${new URLSearchParams({
                            ...(q ? { q } : {}),
                            ...(roleFilter !== "all" ? { role: roleFilter } : {}),
                            ...(sort !== "joined_desc" ? { sort } : {}),
                          }).toString()}`}
                        />
                        <select name="profileId" defaultValue={assignedProfileId} className="h-9 rounded-md border border-input bg-background px-2 text-xs">
                          <option value="">Use role/base pricing</option>
                          {profileOptions.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}{p.tag ? ` (${p.tag})` : ""}
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center justify-between gap-2">
                          <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <input type="checkbox" name="strictPricing" defaultChecked={strictPricing} />
                            Profile only
                          </label>
                          <Button type="submit" size="sm" variant="outline" className="h-8 text-xs">
                            Save profile
                          </Button>
                        </div>
                      </form>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>

          <div className="ops-table-surface table-scroll hidden rounded-lg xl:block">
          <Table className="min-w-[760px] text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Pricing Profile</TableHead>
                <TableHead className="text-right">Wallet Balance</TableHead>
                <TableHead className="text-right">Total Orders</TableHead>
                <TableHead className="text-right">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No users match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((u) => {
                  const assignment = assignmentByUserId.get(u.id)
                  const assignedProfileId = assignment?.pricingProfileId ?? ""
                  const strictPricing = assignment?.strictPricing ?? false
                  const profileOptions = profiles.filter((p) => p.targetRole === "BOTH" || p.targetRole === u.role)
                  const roleCanAssign = u.role === "AGENT" || u.role === "RESELLER"
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name ?? "Unnamed"}</TableCell>
                      <TableCell>{u.email ?? "-"}</TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`text-xs ${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-700"}`}
                        >
                          {ROLE_LABELS[u.role] ?? u.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {roleCanAssign ? (
                          <form method="POST" action="/api/pricing/profiles/assign" className="flex items-center gap-2">
                            <input type="hidden" name="userId" value={u.id} />
                            <input
                              type="hidden"
                              name="returnTo"
                              value={`/dashboard/users?${new URLSearchParams({
                                ...(q ? { q } : {}),
                                ...(roleFilter !== "all" ? { role: roleFilter } : {}),
                                ...(sort !== "joined_desc" ? { sort } : {}),
                              }).toString()}`}
                            />
                            <select
                              name="profileId"
                              defaultValue={assignedProfileId}
                              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                            >
                              <option value="">Use role/base pricing</option>
                              {profileOptions.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}{p.tag ? ` (${p.tag})` : ""}
                                </option>
                              ))}
                            </select>
                            <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground whitespace-nowrap">
                              <input type="checkbox" name="strictPricing" defaultChecked={strictPricing} />
                              Profile only
                            </label>
                            <Button type="submit" size="sm" variant="outline" className="h-8 text-xs">
                              Save
                            </Button>
                          </form>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not applicable</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatGhanaCedis(u.walletBalance)}
                      </TableCell>
                      <TableCell className="text-right">{u.totalOrders}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
