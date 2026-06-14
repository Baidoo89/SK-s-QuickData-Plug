import { auth } from "@/auth";
import { db } from "@/lib/db";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OrderTimelineDialog } from "@/components/orders/order-timeline-dialog";
import { getStorefrontPaymentMap } from "@/lib/storefront-payment-map";
import { PortalAccessMessage } from "@/components/access/portal-access-message";
import { formatGhanaCedis } from "@/lib/currency";
import { resolveOrderRecipientPhone } from "@/lib/order-recipient";
import { ShoppingCart } from "lucide-react";

type OrderFilters = {
  status?: string;
  from?: string;
  to?: string;
  q?: string;
};

function orderStatusBadgeClass(status: string) {
  if (status === "COMPLETED") return "status-success border";
  if (status === "PENDING" || status === "PROCESSING") return "status-warning border";
  if (status === "FAILED" || status === "PAYMENT_FAILED") return "";
  return "status-info border";
}

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
  const hasFilters = Boolean(status || from || to || q);

  const downloadQuery = new URLSearchParams();
  if (status) downloadQuery.set("status", status);
  if (from) downloadQuery.set("from", from);
  if (to) downloadQuery.set("to", to);
  if (q) downloadQuery.set("q", q);
  downloadQuery.set("format", "csv");
  const downloadUrl = `/api/reseller/orders/export?${downloadQuery.toString()}`;

  const session = await auth();
  if (!session?.user?.email) {
    return <PortalAccessMessage title="Login required" description="Sign in with an approved reseller account to view orders." />;
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true, organizationId: true, parentAgentId: true },
  });

  if (!user || user.role !== "RESELLER" || !user.organizationId) {
    return <PortalAccessMessage title="Reseller profile unavailable" description="This account is not linked to an approved reseller profile. Ask your agent or subscriber admin to review the account." />;
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
      { publicOrderCode: { contains: search, mode: "insensitive" } },
      { id: { contains: search } },
      { customer: { name: { contains: search, mode: "insensitive" } } },
      { customer: { email: { contains: search, mode: "insensitive" } } },
      { customer: { phone: { contains: search } } },
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
  const paymentMap = await getStorefrontPaymentMap(orders.map((order) => order.id), user.organizationId);
  const ordersWithPayment = orders.map((order) => ({
    ...order,
    payment: paymentMap.get(order.id) || { owner: "WALLET" as const, status: "PAID", reference: "Wallet/Internal", amount: order.total, paidAt: null },
  }));

  return (
    <div className="portal-page space-y-4">
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
        <Card className="premium-surface border-0">
          <CardHeader>
            <div className="flex flex-col gap-4">
              <CardTitle>Recent orders</CardTitle>
              <form className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-[auto_auto_auto_minmax(12rem,1fr)_auto_auto] lg:items-end" method="GET">
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground mb-1">Status</span>
                  <select
                    name="status"
                    defaultValue={status || "ALL"}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                  >
                    <option value="ALL">All</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="PENDING">Pending</option>
                    <option value="PROCESSING">Processing</option>
                    <option value="PENDING_PAYMENT">Awaiting Payment</option>
                    <option value="PAYMENT_FAILED">Payment Failed</option>
                    <option value="FAILED">Failed</option>
                  </select>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground mb-1">From</span>
                  <Input type="date" name="from" defaultValue={from} className="h-9 w-full text-xs" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground mb-1">To</span>
                  <Input type="date" name="to" defaultValue={to} className="h-9 w-full text-xs" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground mb-1">Search</span>
                  <Input
                    type="text"
                    name="q"
                    placeholder="Name, email, phone"
                    defaultValue={q}
                    className="h-9 w-full text-xs"
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
            {ordersWithPayment.length === 0 ? (
              <EmptyState
                icon={ShoppingCart}
                title={hasFilters ? "No orders match these filters" : "No reseller orders yet"}
                description={
                  hasFilters
                    ? "Adjust the status, date range, or search term to see more reseller orders."
                    : "Place a VTU order from your reseller workspace. Wallet and storefront orders will appear here after checkout."
                }
                action={hasFilters ? { label: "Reset Filters", href: "/reseller/orders" } : { label: "Buy Data", href: "/reseller/buy/single" }}
                secondaryAction={hasFilters ? undefined : { label: "Open Wallet", href: "/reseller/wallet" }}
              />
            ) : (
              <div className="space-y-2">
                <div className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Orders table
                </div>
                <div className="ops-table-surface table-scroll rounded-lg">
                  <Table className="min-w-[820px] text-xs">
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Order ID</TableHead>
                        <TableHead className="whitespace-nowrap">Date</TableHead>
                        <TableHead className="whitespace-nowrap">Customer</TableHead>
                        <TableHead className="whitespace-nowrap">Phone</TableHead>
                        <TableHead className="whitespace-nowrap">Bundle</TableHead>
                        <TableHead className="whitespace-nowrap">Payment</TableHead>
                        <TableHead className="whitespace-nowrap">Status</TableHead>
                        <TableHead className="whitespace-nowrap">Timeline</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Amount (GHS)</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Profit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ordersWithPayment.map((order) => {
                        const date = new Date(order.createdAt);
                        const customerName = order.customer?.name || "Guest";
                        const phone = resolveOrderRecipientPhone(order) || "-";
                        const itemsLabel = order.items
                          .map((item) => formatBundleSize(item.product.name))
                          .join(", ");
                        const profit = order.items.reduce((sum, item) => sum + item.profit, 0);

                        return (
                          <TableRow key={order.id} className="hover:bg-muted/20">
                            <TableCell className="whitespace-nowrap font-mono text-xs font-medium">{order.publicOrderCode || order.id.slice(-8)}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs">{date.toLocaleString()}</TableCell>
                            <TableCell className="text-xs font-medium">{customerName}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs">{phone}</TableCell>
                            <TableCell className="max-w-[260px] text-xs">
                              <span className="line-clamp-2 break-words">{itemsLabel}</span>
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="space-y-1">
                                <Badge variant="outline" className={order.payment.owner === "STOREFRONT" ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"}>
                                  {order.payment.owner === "STOREFRONT" ? order.payment.status : "WALLET"}
                                </Badge>
                                <div className="max-w-[120px] truncate font-mono text-[10px] text-muted-foreground">
                                  {order.payment.reference}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs">
                              <Badge
                                variant={
                                  order.status === "COMPLETED"
                                    ? "secondary"
                                    : order.status === "PENDING" || order.status === "PROCESSING"
                                    ? "outline"
                                    : order.status === "FAILED"
                                    ? "destructive"
                                    : "outline"
                                }
                                className={orderStatusBadgeClass(order.status)}
                              >
                                {order.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <OrderTimelineDialog orderId={order.id} endpointBase="/api/reseller/orders" />
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right text-xs font-semibold">{formatGhanaCedis(order.total)}</TableCell>
                            <TableCell className={profit > 0 ? "whitespace-nowrap text-right text-xs font-semibold text-primary" : "whitespace-nowrap text-right text-xs text-muted-foreground"}>
                              {formatGhanaCedis(profit)}
                            </TableCell>
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
  );
}
