import { auth } from "@/auth";
import { db } from "@/lib/db";
import { formatGhanaCedis } from "@/lib/currency";

import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function getGreetingByTime(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getDisplayName(name: string | null | undefined, email: string | null | undefined): string {
  const trimmedName = name?.trim();
  if (trimmedName) return trimmedName;
  const emailPrefix = email?.split("@")[0]?.trim();
  return emailPrefix || "there";
}

type SalesRangeKey = "daily" | "weekly" | "monthly";

function resolveSalesRange(input?: string): SalesRangeKey {
  if (input === "weekly" || input === "monthly") return input;
  return "daily";
}

function getRangeStart(now: Date, range: SalesRangeKey): Date {
  if (range === "monthly") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (range === "weekly") return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function getRangeLabel(range: SalesRangeKey): string {
  if (range === "weekly") return "Last 7 days";
  if (range === "monthly") return "This month";
  return "Today";
}

export default async function ResellerDashboardPage({ searchParams }: { searchParams?: { salesRange?: string } }) {
  const session = await auth();
  if (!session?.user?.email) {
    return null;
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, email: true, role: true, organizationId: true },
  });

  if (!user || user.role !== "RESELLER" || !user.organizationId) {
    return null;
  }

  const now = new Date();
  const selectedSalesRange = resolveSalesRange(searchParams?.salesRange);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const salesStart = getRangeStart(now, selectedSalesRange);

  const [walletAgg, todaysOrdersCount, monthCompletedAgg, filteredSalesAgg] = await Promise.all([
    db.walletTransaction.aggregate({
      _sum: { amount: true },
      where: { userId: user.id, status: "success" },
    }),
    db.order.count({
      where: {
        organizationId: user.organizationId,
        userId: user.id,
        createdAt: { gte: startOfToday },
      },
    }),
    db.order.aggregate({
      _sum: { total: true },
      where: {
        organizationId: user.organizationId,
        userId: user.id,
        status: "COMPLETED",
        createdAt: { gte: startOfMonth },
      },
    }),
    db.order.aggregate({
      _sum: { total: true },
      where: {
        organizationId: user.organizationId,
        userId: user.id,
        status: "COMPLETED",
        createdAt: { gte: salesStart },
      },
    }),
  ]);

  const walletBalance = walletAgg._sum.amount ?? 0;
  const monthCompletedTotal = monthCompletedAgg._sum.total ?? 0;
  const filteredSales = filteredSalesAgg._sum.total ?? 0;
  const selectedSalesRangeLabel = getRangeLabel(selectedSalesRange);
  const greeting = getGreetingByTime(now);
  const displayName = getDisplayName(user.name, user.email);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-primary">{`${greeting}, ${displayName}.`}</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground max-w-xl">
          Snapshot of your reseller VTU activity: wallet balance, today&apos;s orders, and this
          month&apos;s completed volume.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          {([
            { key: "daily", label: "Daily" },
            { key: "weekly", label: "Weekly" },
            { key: "monthly", label: "Monthly" },
          ] as const).map((item) => {
            const active = selectedSalesRange === item.key;
            const href = item.key === "daily" ? "/reseller" : `/reseller?salesRange=${item.key}`;
            return (
              <Link
                key={item.key}
                href={href}
                className={[
                  "rounded-full border px-3 py-1 text-xs font-semibold transition",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
          <Button asChild size="sm" variant="outline" className="h-7 text-[11px]">
            <Link href={selectedSalesRange === "daily" ? "/api/reseller/analytics/export" : `/api/reseller/analytics/export?salesRange=${selectedSalesRange}`}>
              Export CSV
            </Link>
          </Button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Wallet balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatGhanaCedis(walletBalance)}</div>
            <p className="text-xs text-muted-foreground">Based on successful wallet transactions for this reseller.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Today&apos;s orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todaysOrdersCount}</div>
            <p className="text-xs text-muted-foreground">VTU orders you have placed today.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">This month (completed)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatGhanaCedis(monthCompletedTotal)}</div>
            <p className="text-xs text-muted-foreground">Total value of your completed VTU orders this month.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Sales ({selectedSalesRangeLabel})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatGhanaCedis(filteredSales)}</div>
            <p className="text-xs text-muted-foreground">Revenue from completed orders in selected range.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">API status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">OK</div>
            <p className="text-xs text-muted-foreground">See API docs for programmatic access.</p>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Start selling</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Use your balance to send instant data bundles to your customers.</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button asChild size="sm" className="text-xs">
                <Link href="/reseller/buy/single">Buy single</Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="text-xs">
                <Link href="/reseller/buy/bulk">Buy bulk</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Fund your wallet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Top up via Paystack or ask your parent agent/admin to credit you.</p>
            <Button asChild size="sm" className="text-xs mt-1">
              <Link href="/reseller/wallet">Go to wallet</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Track performance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Review your recent VTU orders and statuses in one place.</p>
            <Button asChild size="sm" variant="outline" className="text-xs mt-1">
              <Link href="/reseller/orders">View orders</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}