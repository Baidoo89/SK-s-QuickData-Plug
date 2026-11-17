import { requireAdmin, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { applyManualOrderStatus } from "@/lib/manual-order-status"
import { z } from "zod"

const rowSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED", "REFUNDED"]),
})

const schema = z.object({
  rows: z.array(rowSchema).min(1),
})

const IMPORTABLE_CURRENT_STATUSES = new Set(["PENDING", "PROCESSING"])

export async function POST(req: Request) {
  try {
    const authResult = await requireAdmin()
    if (isAuthError(authResult)) {
      return authResult
    }

    const isSuperAdmin = authResult.user.role === "SUPERADMIN"
    const organizationId = authResult.user.organizationId

    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return ApiErrors.VALIDATION_ERROR(parsed.error.flatten().fieldErrors)
    }

    let updated = 0
    let failed = 0

    for (const row of parsed.data.rows) {
      try {
        const existing = await db.order.findFirst({
          where: {
            ...(isSuperAdmin ? {} : { organizationId: organizationId! }),
            OR: [
              { id: row.orderId },
              { publicOrderCode: row.orderId },
            ],
          },
          select: { id: true, organizationId: true, status: true },
        })

        if (!existing) {
          failed++
          continue
        }

        if (!IMPORTABLE_CURRENT_STATUSES.has(existing.status)) {
          failed++
          continue
        }

        const saved = await applyManualOrderStatus({ orderId: existing.id, organizationId: existing.organizationId, status: row.status, actorId: authResult.user.id, actorName: authResult.user.email, action: "ORDER_MANUAL_IMPORT_STATUS", expectedStatuses: ["PENDING", "PROCESSING"], manualOnly: true })
        if (!saved) { failed++; continue }

        updated++
      } catch {
        failed++
      }
    }

    return apiSuccess({ updated, failed })
  } catch (error) {
    logApiError("[ADMIN_MANUAL_IMPORT_POST]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
