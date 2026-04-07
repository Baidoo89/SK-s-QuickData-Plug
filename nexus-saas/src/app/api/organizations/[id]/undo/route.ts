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
    const body = await req.json().catch(() => ({}))
    const { auditId } = body || {}

    let audit = null
    if (auditId) {
      audit = await db.auditLog.findUnique({ where: { id: auditId } })
    } else {
      audit = await db.auditLog.findFirst({ where: { organizationId: orgId, action: { in: ["ACTIVATE_ORG", "DEACTIVATE_ORG"] } }, orderBy: { createdAt: "desc" } })
    }

    if (!audit) {
      return ApiErrors.NOT_FOUND("Audit record not found")
    }

    const beforeState = audit.before ? JSON.parse(audit.before as string) : null
    if (!beforeState || typeof beforeState.orgActive === "undefined") {
      return ApiErrors.BAD_REQUEST("No previous state available to undo")
    }

    const result = await db.$transaction(async (tx) => {
      const updatedOrg = await tx.organization.update({ where: { id: orgId }, data: { active: beforeState.orgActive } })

      // If product snapshots provided, restore individual product active states
      if (Array.isArray(beforeState.products)) {
        for (const p of beforeState.products) {
          if (p && p.id) {
            await tx.product.update({ where: { id: p.id }, data: { active: !!p.active } })
          }
        }
      }

      const undoAudit = await tx.auditLog.create({
        data: {
          actorId: user.id ?? null,
          actorName: user.email ?? "",
          action: `UNDO_${audit.action}`,
          targetType: audit.targetType,
          targetId: audit.targetId,
          organizationId: orgId,
          before: audit.after ?? null,
          after: audit.before ?? null,
          meta: JSON.stringify({ undoOf: audit.id }),
        },
      })

      return { updatedOrg, undoAudit }
    })

    return apiSuccess({ ok: true, auditId: result.undoAudit.id })
  } catch (error) {
    console.error("[ORG_UNDO]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}
