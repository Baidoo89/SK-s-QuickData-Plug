import { requireOrgManager, isAuthError } from "@/lib/auth-guard";
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const authResult = await requireOrgManager();
    if (isAuthError(authResult)) {
      return authResult;
    }

    const isSuperAdmin = authResult.user.role === "SUPERADMIN";
    const organizationId = authResult.user.organizationId;

    const [totalOrgs, activeOrgs, totalOrders, completedOrdersAgg, totalAgents] =
      await Promise.all([
        isSuperAdmin
          ? db.organization.count()
          : db.organization.count({ where: { id: organizationId! } }),
        isSuperAdmin
          ? db.organization.count({ where: { active: true } })
          : db.organization.count({ where: { id: organizationId!, active: true } }),
        db.order.count({ where: isSuperAdmin ? {} : { organizationId: organizationId! } }),
        db.order.aggregate({
          where: isSuperAdmin
            ? { status: "COMPLETED" }
            : { status: "COMPLETED", organizationId: organizationId! },
          _sum: { total: true },
        }),
        db.agent.count({ where: isSuperAdmin ? {} : { organizationId: organizationId! } }),
      ]);

    const totalRevenue = completedOrdersAgg._sum.total ?? 0;

    return apiSuccess({
      totalOrgs,
      activeOrgs,
      totalOrders,
      totalRevenue,
      totalAgents,
    });
  } catch (error) {
    logApiError("[ADMIN_OVERVIEW]", error);
    return ApiErrors.INTERNAL_ERROR();
  }
}
