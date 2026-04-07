import { db } from "@/lib/db";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";

export const dynamic = "force-dynamic";

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
};

type ProductRow = {
  id: string;
  name: string;
  category: string | null;
  provider: string | null;
  organization: { name: string } | null;
};

type PendingOrderRow = {
  id: string;
  total: number;
  createdAt: Date;
  phoneNumber: string | null;
  organization: { name: string } | null;
};

export default async function AdminToolsPage() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [organizations, zeroStockProducts, pendingOrders] = await Promise.all([
    db.organization.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
      take: 20,
    }),
    db.product.findMany({
      where: { stock: 0, active: true },
      select: { id: true, name: true, category: true, provider: true, organization: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    db.order.findMany({
      where: { status: "PENDING", createdAt: { lte: thirtyDaysAgo } },
      select: {
        id: true,
        total: true,
        createdAt: true,
        phoneNumber: true,
        organization: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 20,
    }),
  ]) as [OrganizationRow[], ProductRow[], PendingOrderRow[]];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Platform Tools</h2>
        <p className="text-sm text-muted-foreground">
          Diagnostics and housekeeping tools for the platform.
        </p>
      </div>

      {/* Organizations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Organizations
            <Badge variant="secondary">{organizations.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organizations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="py-6 text-center text-sm text-muted-foreground">
                      No organizations found.
                    </TableCell>
                  </TableRow>
                ) : (
                  organizations.map((org: OrganizationRow) => (
                    <TableRow key={org.id}>
                      <TableCell className="font-medium">{org.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{org.slug}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Zero-Stock Active Products */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Active Products with Zero Stock
            <Badge variant="secondary">{zeroStockProducts.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Organization</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zeroStockProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                      No zero-stock active products.
                    </TableCell>
                  </TableRow>
                ) : (
                  zeroStockProducts.map((p: ProductRow) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-xs">{p.category?.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-xs">{p.provider ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.organization?.name ?? "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Stale Pending Orders */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Pending Orders Older Than 30 Days
            <Badge variant={pendingOrders.length > 0 ? "destructive" : "secondary"}>{pendingOrders.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Total (GH₵)</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                      No stale pending orders.
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingOrders.map((order: PendingOrderRow) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-xs">{order.id.slice(0, 10)}…</TableCell>
                      <TableCell className="text-sm">{order.phoneNumber ?? "—"}</TableCell>
                      <TableCell className="text-sm">{order.total.toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{order.organization?.name ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString()}
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
