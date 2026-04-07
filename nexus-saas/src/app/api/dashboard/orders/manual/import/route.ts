import { requireOrgManager, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { reverseOrderProfitIfNeeded, reverseOrderWalletDebitIfNeeded } from "@/lib/order-wallet"
import { z } from "zod"

const rowSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(["PENDING", "COMPLETED", "FAILED", "CANCELLED", "REFUNDED"]),
})

const schema = z.object({
  rows: z.array(rowSchema).min(1),
})

export async function POST(req: Request) {
  try {
    const authResult = await requireOrgManager()
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
            id: row.orderId,
            ...(isSuperAdmin ? {} : { organizationId: organizationId! }),
          },
          select: { id: true, organizationId: true, status: true },
        })

        if (!existing) {
          failed++
          continue
        }

        await db.order.update({
          where: { id: row.orderId },
          data: { status: row.status },
        })

        if (["FAILED", "CANCELLED", "REFUNDED"].includes(row.status)) {
          await reverseOrderWalletDebitIfNeeded({
            orderId: row.orderId,
            organizationId: existing.organizationId,
            reason: `Manual import marked ${row.status.toLowerCase()}`,
          })

          await reverseOrderProfitIfNeeded({
            orderId: row.orderId,
            organizationId: existing.organizationId,
            previousStatus: existing.status,
            reason: `Manual import marked ${row.status.toLowerCase()}`,
          })
        }

        await db.auditLog.create({
          data: {
            actorId: authResult.user.id,
            actorName: authResult.user.email,
            action: "ORDER_MANUAL_IMPORT_STATUS",
            targetType: "ORDER",
            targetId: row.orderId,
            organizationId: existing.organizationId,
            meta: JSON.stringify({ status: row.status }),
          },
        })

        updated++
      } catch {
        failed++
      }
    }

    return apiSuccess({ updated, failed })
  } catch (error) {
    logApiError("[DASHBOARD_MANUAL_IMPORT_POST]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
