import { auth } from "@/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PortalAccessMessage } from "@/components/access/portal-access-message";
import { formatGhanaCedis } from "@/lib/currency";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function ResellersPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/login");
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    include: { organization: true },
  });

  if (!user?.organization) {
    return <PortalAccessMessage title="Organization unavailable" description="This account is not linked to an organization, so reseller records cannot be loaded yet." />;
  }

  const resellers = await db.user.findMany({
    where: {
      organizationId: user.organization.id,
      role: "RESELLER",
    },
    select: {
      id: true,
      name: true,
      email: true,
      active: true,
      signupStatus: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const resellerIds = resellers.map((reseller) => reseller.id);

  const [walletSums, orderStats] = await Promise.all([
    db.walletTransaction.groupBy({
      by: ["userId"],
      where: { userId: { in: resellerIds }, status: "success" },
      _sum: { amount: true },
    }),
    db.order.groupBy({
      by: ["userId"],
      where: { organizationId: user.organization.id, userId: { in: resellerIds } },
      _count: { _all: true },
      _sum: { total: true },
    }),
  ]);

  const walletByUserId = new Map(
    walletSums.filter((row) => row.userId).map((row) => [row.userId as string, row._sum.amount ?? 0])
  );
  const ordersByUserId = new Map(
    orderStats.filter((row) => row.userId).map((row) => [row.userId as string, row._count._all])
  );
  const volumeByUserId = new Map(
    orderStats.filter((row) => row.userId).map((row) => [row.userId as string, row._sum.total ?? 0])
  );

  return (
    <div className="portal-page flex flex-col gap-6 md:gap-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-1">Resellers</h1>
          <p className="text-muted-foreground max-w-xl">View reseller accounts across your agent network.</p>
        </div>
      </div>

      <Card className="premium-surface overflow-hidden rounded-lg">
        <CardHeader className="border-b border-border/70 bg-muted/20">
          <CardTitle>Reseller directory</CardTitle>
          <CardDescription>Wallet, orders, and sales volume by reseller.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 xl:hidden lg:grid-cols-2">
            {resellers.map((r) => {
              const walletBalance = walletByUserId.get(r.id) ?? 0;
              const resellerOrders = ordersByUserId.get(r.id) ?? 0;
              const resellerVolume = volumeByUserId.get(r.id) ?? 0;
              const approved = r.signupStatus === "APPROVED" && r.active;
              return (
                <div key={r.id} className="rounded-lg border border-border/70 bg-background/80 p-3 text-sm shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/dashboard/users/resellers/${r.id}`} className="truncate font-semibold text-foreground hover:text-primary hover:underline">{r.name ?? "Unnamed"}</Link>
                      <p className="break-all text-xs text-muted-foreground">{r.email}</p>
                    </div>
                    <Badge variant={approved ? "secondary" : r.signupStatus === "PENDING" ? "outline" : "destructive"} className={approved ? "status-success border" : r.signupStatus === "PENDING" ? "status-warning border" : ""}>
                      {approved ? "Active" : r.signupStatus}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <p className="font-semibold text-foreground">{formatGhanaCedis(walletBalance)}</p>
                      <p>Wallet</p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{resellerOrders}</p>
                      <p>Orders</p>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{formatGhanaCedis(resellerVolume)}</p>
                      <p>Volume</p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{new Date(r.createdAt).toLocaleDateString()}</p>
                      <p>Joined</p>
                    </div>
                  </div>
                </div>
              );
            })}
            {resellers.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No resellers found yet. You can create reseller accounts under an agent and then credit their wallets from the wallet section.
              </p>
            )}
          </div>

          <div className="ops-table-surface table-scroll hidden rounded-lg xl:block">
          <Table className="min-w-[720px] text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Wallet</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Volume</TableHead>
                <TableHead className="text-right">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resellers.map((r) => {
                const walletBalance = walletByUserId.get(r.id) ?? 0;
                const resellerOrders = ordersByUserId.get(r.id) ?? 0;
                const resellerVolume = volumeByUserId.get(r.id) ?? 0;
                const approved = r.signupStatus === "APPROVED" && r.active;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium"><Link href={`/dashboard/users/resellers/${r.id}`} className="hover:text-primary hover:underline">{r.name ?? "Unnamed"}</Link></TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>
                      <Badge variant={approved ? "secondary" : r.signupStatus === "PENDING" ? "outline" : "destructive"} className={approved ? "status-success border" : r.signupStatus === "PENDING" ? "status-warning border" : ""}>
                        {approved ? "Active" : r.signupStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatGhanaCedis(walletBalance)}</TableCell>
                    <TableCell className="text-right">{resellerOrders}</TableCell>
                    <TableCell className="text-right">{formatGhanaCedis(resellerVolume)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                );
              })}
              {resellers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">
                    No resellers found yet. You can create reseller accounts under an agent and then credit their wallets from the wallet section.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
