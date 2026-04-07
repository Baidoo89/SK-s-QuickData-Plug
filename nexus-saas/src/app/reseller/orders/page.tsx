import { auth } from "@/auth";
import { db } from "@/lib/db";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type OrderFilters = {
  status?: string;
  from?: string;
  to?: string;
  q?: string;
};

export default async function ResellerOrdersPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const status = typeof searchParams?.status === "string" ? searchParams.status : undefined;
  const from = typeof searchParams?.from === "string" ? searchParams.from : undefined;
  const to = typeof searchParams?.to === "string" ? searchParams.to : undefined;
  const q = typeof searchParams?.q === "string" ? searchParams.q : undefined;

  const filters: OrderFilters = { status, from, to, q };

  const downloadQuery = new URLSearchParams();
  if (status) downloadQuery.set("status", status);
  if (from) downloadQuery.set("from", from);
  if (to) downloadQuery.set("to", to);
  if (q) downloadQuery.set("q", q);
  downloadQuery.set("format", "csv");
  const downloadUrl = `/api/reseller/orders/export?${downloadQuery.toString()}`;

  const session = await auth();
  if (!session?.user?.email) {
    return null;
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true, organizationId: true, parentAgentId: true },
  });

  if (!user || user.role !== "RESELLER" || !user.organizationId) {
    return null;
  }

  function formatBundleSize(name: string) {
    const match = name.match(/\b\d+(?:\.\d+)?\s?(?:GB|MB|KB|TB)\b/i)
    return match ? match[0].replace(/\s+/g, "").toUpperCase() : name
  }

  const where: any = {
    organizationId: user.organizationId,
    userId: user.id,
  };

  if (filters.status && filters.status !== "ALL") {
    where.status = filters.status;
  }

  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) {
      where.createdAt.gte = new Date(filters.from);
    }
    if (filters.to) {
      const toDate = new Date(filters.to);
      toDate.setHours(23, 59, 59, 999);
      where.createdAt.lte = toDate;
    }
  }

  if (filters.q) {
    const search = filters.q;
    where.OR = [
      { customer: { name: { contains: search, mode: "insensitive" } } },
      { customer: { email: { contains: search, mode: "insensitive" } } },
      { phoneNumber: { contains: search } },
    ];
  }

  const orders = await db.order.findMany({
    where,
    include: {
      customer: true,
      items: {
        include: {
          product: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-1 flex-col items-center">
      <div className="w-full max-w-4xl space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Orders</h1>
            <p className="text-sm text-muted-foreground max-w-xl">
              View VTU orders you have placed as a reseller. Your parent agent and the admin can also see these orders.
            </p>
          </div>
          <a href={downloadUrl}>
            <Button variant="outline" className="w-full sm:w-auto">
              Download CSV
            </Button>
          </a>
        </div>
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4">
              <CardTitle>Recent orders</CardTitle>
              <form className="flex flex-wrap gap-2 md:gap-3 items-end" method="GET">
                <div className="flex w-full flex-col sm:w-auto">
                  <span className="text-xs text-muted-foreground mb-1">Status</span>
                  <select
                    name="status"
                    defaultValue={status || "ALL"}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs sm:w-[140px]"
                  >
                    <option value="ALL">All</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="PENDING">Pending</option>
                    <option value="PROCESSING">Processing</option>
                    <option value="FAILED">Failed</option>
                  </select>
                </div>
                <div className="flex w-full flex-col sm:w-auto">
                  <span className="text-xs text-muted-foreground mb-1">From</span>
                  <Input type="date" name="from" defaultValue={from} className="h-9 w-full text-xs sm:w-[150px]" />
                </div>
                <div className="flex w-full flex-col sm:w-auto">
                  <span className="text-xs text-muted-foreground mb-1">To</span>
                  <Input type="date" name="to" defaultValue={to} className="h-9 w-full text-xs sm:w-[150px]" />
                </div>
                <div className="flex w-full flex-col sm:w-auto">
                  <span className="text-xs text-muted-foreground mb-1">Search</span>
                  <Input
                    type="text"
                    name="q"
                    placeholder="Name, email, phone"
                    defaultValue={q}
                    className="h-9 w-full text-xs sm:w-44 md:w-56"
                  />
                </div>
                <Button type="submit" className="h-9 w-full text-xs sm:w-auto">Apply</Button>
                <Button asChild type="button" variant="outline" className="h-9 w-full text-xs sm:w-auto">
                  <a href="/reseller/orders">Reset</a>
                </Button>
              </form>
            </div>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No orders yet. When you start placing VTU orders, they will appear here.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Orders table
                </div>
                <div className="w-full max-w-full overflow-x-auto rounded-md border bg-background">
                  <Table className="min-w-[820px] text-xs">
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Date</TableHead>
                        <TableHead className="whitespace-nowrap">Customer</TableHead>
                        <TableHead className="whitespace-nowrap">Phone</TableHead>
                        <TableHead className="whitespace-nowrap">Bundle</TableHead>
                        <TableHead className="whitespace-nowrap">Status</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Amount (GH₵)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((order) => {
                        const date = new Date(order.createdAt);
                        const customerName = order.customer?.name || "Guest";
                        const phone = order.phoneNumber || order.customer?.phone || "-";
                        const itemsLabel = order.items
                          .map((item) => formatBundleSize(item.product.name))
                          .join(", ");

                        return (
                          <TableRow key={order.id} className="hover:bg-muted/20">
                            <TableCell className="whitespace-nowrap text-xs">{date.toLocaleString()}</TableCell>
                            <TableCell className="text-xs font-medium">{customerName}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs">{phone}</TableCell>
                            <TableCell className="max-w-[260px] text-xs">
                              <span className="line-clamp-2 break-words">{itemsLabel}</span>
                            </TableCell>
                            <TableCell className="text-xs">
                              <Badge
                                variant={
                                  order.status === "COMPLETED"
                                    ? "default"
                                    : order.status === "PENDING" || order.status === "PROCESSING"
                                    ? "secondary"
                                    : order.status === "FAILED"
                                    ? "destructive"
                                    : "outline"
                                }
                                className={
                                  order.status === "COMPLETED"
                                    ? "bg-emerald-500/90"
                                    : order.status === "PENDING"
                                    ? "border-amber-500 text-amber-600"
                                    : order.status === "PROCESSING"
                                    ? "border-sky-500 text-sky-600"
                                    : order.status === "FAILED"
                                    ? ""
                                    : "border-muted-foreground/40 text-muted-foreground"
                                }
                              >
                                {order.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right text-xs font-semibold">{order.total.toFixed(2)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
      </Card>
      </div>
    </div>
  );
}