import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors } from "@/lib/api-response"

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const authResult = await requireAdmin()
    if (isAuthError(authResult)) return authResult
    const user = authResult.user

    const orgId = params.id

    const before = await db.organization.findUnique({ where: { id: orgId }, include: { products: { select: { id: true, active: true } } } })
    if (!before) return ApiErrors.NOT_FOUND("Organization not found")

    const result = await db.$transaction(async (tx) => {
      const updatedOrg = await tx.organization.update({ where: { id: orgId }, data: { active: false } })
      const prodRes = await tx.product.updateMany({ where: { organizationId: orgId }, data: { active: false } })

      const audit = await tx.auditLog.create({
        data: {
          actorId: user.id ?? null,
          actorName: user.email ?? "",
          action: "DEACTIVATE_ORG",
          targetType: "Organization",
          targetId: orgId,
          organizationId: orgId,
          before: before ? JSON.stringify({ orgActive: before.active, products: before.products }) : null,
          after: JSON.stringify({ orgActive: false }),
          meta: JSON.stringify({ productsAffected: prodRes.count }),
        },
      })

      return { updatedOrg, prodRes, audit }
    })

    return apiSuccess({ ok: true, auditId: result.audit.id })
  } catch (error) {
    console.error("[ORG_DEACTIVATE]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}
