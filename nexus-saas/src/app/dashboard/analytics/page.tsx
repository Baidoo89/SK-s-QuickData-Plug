import { auth } from "@/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Overview } from "@/components/overview";
import { Button } from "@/components/ui/button";
import { DollarSign, Percent, Users, Activity, BarChart2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdvancedAnalyticsTables } from "@/components/dashboard/advanced-analytics-tables";
import { formatGhanaCedis } from "@/lib/currency";

function getRangeDates(range: string) {
  const now = new Date();
  const end = now;
  let start: Date;

  switch (range) {
    case "today":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "7d":
      start = new Date(now);
      start.setDate(now.getDate() - 6);
      break;
    case "30d":
      start = new Date(now);
      start.setDate(now.getDate() - 29);
      break;
    case "month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "year":
      start = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      start = new Date(now);
      start.setDate(now.getDate() - 6);
  }

  return { start, end };
}

function formatDateLabel(date: Date) {
  return `${date.getDate()} ${date.toLocaleString("default", { month: "short" })}`;
}

export default async function AnalyticsPage({ searchParams }: { searchParams: { range?: string } }) {
  const session = await auth();
  if (!session?.user?.email) {
    return notFound();
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    include: { organization: true },
  });

  if (!user?.organizationId) {
    return notFound();
  }

  const range = searchParams.range || "7d";
  const { start, end } = getRangeDates(range);

  const orders = await db.order.findMany({
    where: {
      organizationId: user.organizationId,
      createdAt: {
        gte: start,
        lte: end,
      },
    },
    include: {
      items: {
        include: {
          product: true,
        },
      },
      agent: true,
      customer: true,
    },
    orderBy: { createdAt: "asc" },
  });

  let revenue = 0;
  let profit = 0;
  let completed = 0;
  let failed = 0;
  const byDay = new Map<string, number>();
  const byNetwork = new Map<string, number>();
  const byAgent = new Map<string, { name: string; revenue: number; orders: number }>();
  const byProduct = new Map<string, { name: string; revenue: number; orders: number }>();
  const activeCustomerIds = new Set<string>();
  const activeAgentIds = new Set<string>();

  for (const order of orders) {
    if (order.status === "COMPLETED") {
      revenue += order.total;
      completed += 1;
    }
    if (order.status === "FAILED") {
      failed += 1;
    }

    const dayKey = order.createdAt.toISOString().slice(0, 10);
    const currentForDay = byDay.get(dayKey) ?? 0;
    byDay.set(dayKey, currentForDay + (order.status === "COMPLETED" ? order.total : 0));

    for (const item of order.items) {
      profit += item.profit;

      const provider = item.product.provider || "OTHER";
      const currentNetwork = byNetwork.get(provider) ?? 0;
      byNetwork.set(provider, currentNetwork + (order.status === "COMPLETED" ? order.total : 0));

      const productKey = item.product.id;
      const existingProduct = byProduct.get(productKey) ?? {
        name: item.product.name,
        revenue: 0,
        orders: 0,
      };
      if (order.status === "COMPLETED") {
        existingProduct.revenue += order.total;
        existingProduct.orders += 1;
      }
      byProduct.set(productKey, existingProduct);
    }

    if (order.agentId && order.agent) {
      activeAgentIds.add(order.agentId);
      const agentKey = order.agentId;
      const existingAgent = byAgent.get(agentKey) ?? {
        name: order.agent.name,
        revenue: 0,
        orders: 0,
      };
      if (order.status === "COMPLETED") {
        existingAgent.revenue += order.total;
        existingAgent.orders += 1;
      }
      byAgent.set(agentKey, existingAgent);
    }

    if (order.customerId && order.customer) {
      activeCustomerIds.add(order.customerId);
    }
  }

  const successRate = orders.length > 0 ? (completed / orders.length) * 100 : 0;
  const averageOrderValue = completed > 0 ? revenue / completed : 0;

  const dailySeries = Array.from(byDay.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, total]) => ({ name: formatDateLabel(new Date(day)), total }));

  const networkRows = Array.from(byNetwork.entries())
    .map(([provider, value]) => ({ provider, value }))
    .sort((a, b) => b.value - a.value);

  const topAgents = Array.from(byAgent.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const topProducts = Array.from(byProduct.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  return (
    <div className="flex-1 space-y-4 px-4 py-6 md:p-8 md:pt-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            Advanced Analytics
            <BarChart2 className="h-5 w-5 text-muted-foreground" />
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Deep dive into revenue, profit, reliability, and agent performance for your VTU business.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Today", value: "today" },
            { label: "Last 7 days", value: "7d" },
            { label: "Last 30 days", value: "30d" },
            { label: "This month", value: "month" },
            { label: "This year", value: "year" },
          ].map((option) => (
            <Link
              key={option.value}
              href={`/dashboard/analytics?range=${option.value}`}
              scroll={false}
            >
              <Button
                variant={range === option.value ? "default" : "outline"}
                size="sm"
              >
                {option.label}
              </Button>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        <Card className="bg-gradient-to-br from-slate-100 via-white to-slate-200 border border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs md:text-sm text-primary font-semibold">Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg md:text-2xl font-bold text-accent-foreground">{formatGhanaCedis(revenue)}</div>
            <p className="text-xs md:text-sm text-muted-foreground">Completed orders in selected period</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-white via-slate-100 to-slate-200 border border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs md:text-sm text-primary font-semibold">Profit</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg md:text-2xl font-bold text-accent-foreground">{formatGhanaCedis(profit)}</div>
            <p className="text-xs md:text-sm text-muted-foreground">Sum of item-level profit</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-slate-100 via-white to-slate-200 border border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs md:text-sm text-primary font-semibold">Orders</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg md:text-2xl font-bold text-accent-foreground">{orders.length}</div>
            <p className="text-xs md:text-sm text-muted-foreground">All statuses in selected period</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-white via-slate-100 to-slate-200 border border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs md:text-sm text-primary font-semibold">Success rate</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg md:text-2xl font-bold text-accent-foreground">{successRate.toFixed(1)}%</div>
            <p className="text-xs md:text-sm text-muted-foreground">{completed} successful • {failed} failed</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-slate-100 via-white to-slate-200 border border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs md:text-sm text-primary font-semibold">Average order value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg md:text-2xl font-bold text-accent-foreground">{formatGhanaCedis(averageOrderValue)}</div>
            <p className="text-xs md:text-sm text-muted-foreground">Completed orders only</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-white via-slate-100 to-slate-200 border border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs md:text-sm text-primary font-semibold">Active customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg md:text-2xl font-bold text-accent-foreground">{activeCustomerIds.size}</div>
            <p className="text-xs md:text-sm text-muted-foreground">Placed at least one order in period</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-slate-100 via-white to-slate-200 border border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs md:text-sm text-primary font-semibold">Active agents</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg md:text-2xl font-bold text-accent-foreground">{activeAgentIds.size}</div>
            <p className="text-xs md:text-sm text-muted-foreground">Agents with at least one order</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-1 lg:col-span-4">
          <CardHeader>
            <CardTitle>Revenue over time</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <Overview data={dailySeries} />
          </CardContent>
        </Card>
      </div>
      <AdvancedAnalyticsTables
        networkRows={networkRows}
        topAgents={topAgents}
        topProducts={topProducts}
      />
    </div>
  );
}
