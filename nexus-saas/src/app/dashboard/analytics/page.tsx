import { auth } from "@/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Overview } from "@/components/overview";
import { Button } from "@/components/ui/button";
import { DollarSign, Percent, Users, Activity, BarChart2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdvancedAnalyticsTables } from "@/components/dashboard/advanced-analytics-tables";
import { formatGhanaCedis } from "@/lib/currency";
import { MetricCard } from "@/components/ui/metric-card";

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
    const isCompleted = order.status === "COMPLETED";

    if (order.status === "COMPLETED") {
      revenue += order.total;
      completed += 1;
    }
    if (order.status === "FAILED") {
      failed += 1;
    }

    const dayKey = order.createdAt.toISOString().slice(0, 10);
    const currentForDay = byDay.get(dayKey) ?? 0;
    byDay.set(dayKey, currentForDay + (isCompleted ? order.total : 0));

    const orderProductIds = new Set<string>();

    for (const item of order.items) {
      if (isCompleted) {
        // Profit is meaningful only for completed sales.
        profit += item.profit;
      }

      const lineRevenue = isCompleted ? item.price * item.quantity : 0;

      const provider = item.product.provider || "OTHER";
      const currentNetwork = byNetwork.get(provider) ?? 0;
      byNetwork.set(provider, currentNetwork + lineRevenue);

      const productKey = item.product.id;
      const existingProduct = byProduct.get(productKey) ?? {
        name: item.product.name,
        revenue: 0,
        orders: 0,
      };
      if (isCompleted) {
        existingProduct.revenue += lineRevenue;
        if (!orderProductIds.has(productKey)) {
          existingProduct.orders += 1;
          orderProductIds.add(productKey);
        }
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
      if (isCompleted) {
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
    <div className="portal-page flex-1 space-y-4">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            Advanced Analytics
            <BarChart2 className="h-5 w-5 text-muted-foreground" />
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Deep dive into revenue, profit, reliability, and agent performance for your VTU business.
          </p>
        </div>
        <div className="flex w-full min-w-0 flex-wrap gap-2 sm:w-auto">
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
                className="w-full sm:w-auto"
              >
                {option.label}
              </Button>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Revenue" value={formatGhanaCedis(revenue)} description="Completed orders in selected period" icon={DollarSign} tone="success" />
        <MetricCard label="Profit" value={formatGhanaCedis(profit)} description="Sum of item-level profit" icon={DollarSign} tone="primary" />
        <MetricCard label="Orders" value={orders.length} description="All statuses in selected period" icon={Activity} tone="info" />
        <Card className="premium-surface overflow-hidden rounded-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/70 bg-muted/20 pb-2">
            <CardTitle className="text-xs md:text-sm text-foreground font-semibold">Success rate</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg md:text-2xl font-bold text-foreground">{successRate.toFixed(1)}%</div>
            <p className="text-xs md:text-sm text-muted-foreground">{completed} successful / {failed} failed</p>
          </CardContent>
        </Card>
        <MetricCard label="Average Order Value" value={formatGhanaCedis(averageOrderValue)} description="Completed orders only" icon={DollarSign} tone="muted" />
        <MetricCard label="Active Customers" value={activeCustomerIds.size} description="Placed at least one order in period" icon={Users} tone="primary" />
        <MetricCard label="Active Agents" value={activeAgentIds.size} description="Agents with at least one order" icon={Users} tone="info" />
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="premium-surface col-span-1 min-w-0 overflow-hidden rounded-lg lg:col-span-4">
          <CardHeader className="border-b border-border/70 bg-muted/20">
            <CardTitle>Revenue over time</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 overflow-hidden pl-2">
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
