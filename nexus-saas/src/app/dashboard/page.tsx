import Link from "next/link";
import { ExternalLink, CreditCard, DollarSign, Users, Activity, ArrowDownRight, ArrowUpRight, AlertTriangle } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Overview } from "@/components/overview";
import { RecentSales } from "@/components/recent-sales";
import { StoreLinkCard } from "@/components/dashboard/store-link-card";
import { formatGhanaCedis } from "@/lib/currency";

export default async function DashboardPage() {
  const session = await auth();
  
  let storeUrl = "#";
  let totalRevenue = 0;
  let revenueToday = 0;
  let revenueThisWeek = 0;
  let revenueThisMonth = 0;
  let changeTodayVsYesterday = 0;
  let changeWeekVsLastWeek = 0;
  let changeMonthVsLastMonth = 0;
  let totalOrders = 0;
  let completedOrders = 0;
  let failedOrders = 0;
  let successRate = 0;
  let totalCustomers = 0;
  let recentSales: any[] = [];
  let monthlySalesData: any[] = [];
  try {
    if (session?.user?.email) {
      const user = await db.user.findUnique({
        where: { email: session.user.email },
        include: { organization: true },
      });
      
      if (user?.organization?.slug) {
        storeUrl = `/store/${user.organization.slug}`;
      }

      if (user?.organizationId) {
        // Fetch revenue-related data (completed orders for revenue)
        const completedOrdersData = await db.order.findMany({
          where: { 
            organizationId: user.organizationId,
            status: "COMPLETED" // Assuming we only count completed orders
          },
          select: { total: true, createdAt: true }
        });
        totalRevenue = completedOrdersData.reduce((acc, order) => acc + order.total, 0);

        // Time boundaries for filters
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Start of week (Monday) in local time
        const day = now.getDay(); // 0 (Sun) - 6 (Sat)
        const diffToMonday = (day + 6) % 7; // 0 -> Mon, 6 -> Sun
        const startOfWeek = new Date(startOfToday);
        startOfWeek.setDate(startOfToday.getDate() - diffToMonday);

        // Start of month
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Initialize monthly data (for the chart) and compute period revenues
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const currentYear = now.getFullYear();
        const monthlyData = months.map(month => ({ name: month, total: 0 }));

        // Previous period boundaries
        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfToday.getDate() - 1);
        const endOfYesterday = new Date(startOfToday);

        const startOfLastWeek = new Date(startOfWeek);
        startOfLastWeek.setDate(startOfWeek.getDate() - 7);
        const endOfLastWeek = new Date(startOfWeek);

        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        let revenueYesterday = 0;
        let revenueLastWeek = 0;
        let revenueLastMonth = 0;

        completedOrdersData.forEach(order => {
          const date = new Date(order.createdAt);

          // Per-period revenue
          if (date >= startOfToday) {
            revenueToday += order.total;
          }
          if (date >= startOfWeek) {
            revenueThisWeek += order.total;
          }
          if (date >= startOfMonth) {
            revenueThisMonth += order.total;
          }

           // Previous periods
           if (date >= startOfYesterday && date < endOfYesterday) {
            revenueYesterday += order.total;
           }
           if (date >= startOfLastWeek && date < endOfLastWeek) {
            revenueLastWeek += order.total;
           }
           if (date >= startOfLastMonth && date < endOfLastMonth) {
            revenueLastMonth += order.total;
           }

          // Monthly aggregation for the current year
          if (date.getFullYear() === currentYear) {
            const monthIndex = date.getMonth();
            monthlyData[monthIndex].total += order.total;
          }
        });
        monthlySalesData = monthlyData;

        // Compute percentage changes vs previous periods (defensive against division by zero)
        if (revenueYesterday > 0) {
          changeTodayVsYesterday = ((revenueToday - revenueYesterday) / revenueYesterday) * 100;
        }
        if (revenueLastWeek > 0) {
          changeWeekVsLastWeek = ((revenueThisWeek - revenueLastWeek) / revenueLastWeek) * 100;
        }
        if (revenueLastMonth > 0) {
          changeMonthVsLastMonth = ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100;
        }

        // Fetch Total Orders
        totalOrders = await db.order.count({
          where: { organizationId: user.organizationId }
        });

        // Success / failure breakdown
        completedOrders = await db.order.count({
          where: { organizationId: user.organizationId, status: "COMPLETED" }
        });
        failedOrders = await db.order.count({
          where: { organizationId: user.organizationId, status: "FAILED" }
        });
        if (totalOrders > 0) {
          successRate = (completedOrders / totalOrders) * 100;
        }

        // Fetch Total Customers
        totalCustomers = await db.customer.count({
          where: { organizationId: user.organizationId }
        });

        // Fetch Recent Sales
        const recentOrders = await db.order.findMany({
          where: { organizationId: user.organizationId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { user: true, customer: true }
        });

        recentSales = recentOrders.map(order => ({
          id: order.id,
          name: order.customer?.name || order.user?.name || "Unknown",
          email: order.customer?.email || order.user?.email || "No email",
          amount: order.total
        }));
      }
    }
  } catch (error) {
    console.error("Error loading dashboard data", error);
    // Keep default zero values so the dashboard still renders
  }

  return (
    <div className="flex-1 px-2 py-4 md:p-8 md:pt-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h2>
        <div className="flex items-center space-x-2 sm:justify-end">
          {storeUrl !== "#" && (
            <Link href={storeUrl} target="_blank">
              <Button variant="outline" className="gap-2 w-full sm:w-auto justify-center">
                View Store <ExternalLink className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </div>
      <StoreLinkCard storePath={storeUrl !== "#" ? storeUrl : null} />

      {/* Quick Analytics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <Card className="bg-gradient-to-br from-slate-100 via-white to-slate-200 border border-slate-200 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-primary">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl md:text-3xl font-bold text-accent-foreground">{formatGhanaCedis(totalRevenue)}</div>
            <p className="text-xs md:text-sm text-muted-foreground">Completed orders only</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-white via-slate-100 to-slate-200 border border-slate-200 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-primary">Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl md:text-3xl font-bold text-accent-foreground">{totalOrders}</div>
            <p className="text-xs md:text-sm text-muted-foreground">All-time</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-slate-100 via-white to-slate-200 border border-slate-200 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-primary">Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl md:text-3xl font-bold text-accent-foreground">{totalCustomers}</div>
            <p className="text-xs md:text-sm text-muted-foreground">Unique customers</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-100 via-white to-green-200 border border-green-200 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-700">Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl md:text-3xl font-bold text-green-700">{successRate.toFixed(1)}%</div>
            <p className="text-xs md:text-sm text-muted-foreground">Completed vs failed</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Analytics Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4 mt-4">
        <Card className="col-span-1 lg:col-span-4 bg-gradient-to-br from-slate-100 via-white to-slate-200 border border-slate-200">
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <Overview data={monthlySalesData} />
          </CardContent>
        </Card>
        <Card className="col-span-1 lg:col-span-3 bg-gradient-to-br from-white via-slate-100 to-slate-200 border border-slate-200">
          <CardHeader>
            <CardTitle>Recent Sales</CardTitle>
            <div className="text-sm text-muted-foreground">You made {recentSales.length} sales recently.</div>
          </CardHeader>
          <CardContent>
            <RecentSales sales={recentSales} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
