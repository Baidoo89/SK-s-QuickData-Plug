import { NextResponse } from "next/server";
import { requireOrgManager, isAuthError } from "@/lib/auth-guard";
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const authResult = await requireOrgManager();
    if (isAuthError(authResult)) {
      return authResult;
    }

    const organizationId = authResult.user.organizationId!;

    const agents = await db.agent.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        user: {
          select: { email: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    if (!agents.length) {
      return apiSuccess([]);
    }

    const agentPrices = await db.agentPrice.groupBy({
      by: ["agentId"],
      where: { organizationId },
      _count: { _all: true },
    });

    const countByAgent: Record<string, number> = {};
    for (const row of agentPrices) {
      // @ts-ignore - prisma groupBy typing
      countByAgent[row.agentId] = row._count._all as number;
    }

    const result = agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      email: agent.user?.email ?? null,
      overrides: countByAgent[agent.id] ?? 0,
    }));

    return apiSuccess(result);
  } catch (error) {
    logApiError("[PRICING_AGENT_SUMMARY_GET]", error);
    return ApiErrors.INTERNAL_ERROR();
  }
}
