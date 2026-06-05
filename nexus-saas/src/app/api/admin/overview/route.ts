import { requireAdmin, isAuthError } from "@/lib/auth-guard";
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authResult = await requireAdmin();
    if (isAuthError(authResult)) {
      return authResult;
    }

    const isSuperAdmin = authResult.user.role === "SUPERADMIN";
    const organizationId = authResult.user.organizationId;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = now.getDay();
    const diffToMonday = (day + 6) % 7;
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfToday.getDate() - diffToMonday);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const scopedOrderWhere = isSuperAdmin ? {} : { organizationId: organizationId! };
    const scopedCompletedOrderWhere = isSuperAdmin
      ? { status: "COMPLETED" as const }
      : { status: "COMPLETED" as const, organizationId: organizationId! };
    const scopedProfitWhere = isSuperAdmin
      ? { order: { status: "COMPLETED" as const } }
      : { order: { status: "COMPLETED" as const, organizationId: organizationId! } };

    const [
      totalOrgs,
      activeOrgs,
      totalOrders,
      completedOrdersAgg,
      totalAgents,
      activeProducts,
      pendingAudits,
      revenueTodayAgg,
      revenueWeekAgg,
      revenueMonthAgg,
      profitTodayAgg,
      profitWeekAgg,
      profitMonthAgg,
    ] =
      await Promise.all([
        isSuperAdmin
          ? db.organization.count()
          : db.organization.count({ where: { id: organizationId! } }),
        isSuperAdmin
          ? db.organization.count({ where: { active: true } })
          : db.organization.count({ where: { id: organizationId!, active: true } }),
        db.order.count({ where: scopedOrderWhere }),
        db.order.aggregate({
          where: scopedCompletedOrderWhere,
          _sum: { total: true },
        }),
        db.agent.count({ where: isSuperAdmin ? {} : { organizationId: organizationId! } }),
        db.product.count({ where: isSuperAdmin ? { active: true } : { organizationId: organizationId!, active: true } }),
        db.auditLog.count({
          where: isSuperAdmin
            ? { action: { in: ["ACTIVATE_ORG", "DEACTIVATE_ORG"] } }
            : { organizationId: organizationId!, action: { in: ["ACTIVATE_ORG", "DEACTIVATE_ORG"] } },
        }),
        db.order.aggregate({
          where: { ...scopedCompletedOrderWhere, createdAt: { gte: startOfToday } },
          _sum: { total: true },
        }),
        db.order.aggregate({
          where: { ...scopedCompletedOrderWhere, createdAt: { gte: startOfWeek } },
          _sum: { total: true },
        }),
        db.order.aggregate({
          where: { ...scopedCompletedOrderWhere, createdAt: { gte: startOfMonth } },
          _sum: { total: true },
        }),
        db.orderItem.aggregate({
          where: { ...scopedProfitWhere, order: { ...scopedProfitWhere.order, createdAt: { gte: startOfToday } } },
          _sum: { profit: true },
        }),
        db.orderItem.aggregate({
          where: { ...scopedProfitWhere, order: { ...scopedProfitWhere.order, createdAt: { gte: startOfWeek } } },
          _sum: { profit: true },
        }),
        db.orderItem.aggregate({
          where: { ...scopedProfitWhere, order: { ...scopedProfitWhere.order, createdAt: { gte: startOfMonth } } },
          _sum: { profit: true },
        }),
      ]);

    const totalRevenue = completedOrdersAgg._sum.total ?? 0;
    const revenueToday = revenueTodayAgg._sum.total ?? 0;
    const revenueThisWeek = revenueWeekAgg._sum.total ?? 0;
    const revenueThisMonth = revenueMonthAgg._sum.total ?? 0;
    const profitToday = profitTodayAgg._sum.profit ?? 0;
    const profitThisWeek = profitWeekAgg._sum.profit ?? 0;
    const profitThisMonth = profitMonthAgg._sum.profit ?? 0;

    return apiSuccess({
      totalOrgs,
      activeOrgs,
      totalOrders,
      totalRevenue,
      totalAgents,
      activeProducts,
      pendingAudits,
      revenueToday,
      revenueThisWeek,
      revenueThisMonth,
      profitToday,
      profitThisWeek,
      profitThisMonth,
    });
  } catch (error) {
    logApiError("[ADMIN_OVERVIEW]", error);
    return ApiErrors.INTERNAL_ERROR();
  }
}
