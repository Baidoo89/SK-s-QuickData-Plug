import { requireOrgManager, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { z } from "zod"

const schema = z.object({
  orderIds: z.array(z.string().min(1)).min(1),
  status: z.enum(["PENDING", "COMPLETED", "FAILED"]),
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

    const uniqueIds = Array.from(new Set(parsed.data.orderIds))

    const result = await db.order.updateMany({
      where: {
        id: { in: uniqueIds },
        ...(isSuperAdmin ? {} : { organizationId: organizationId! }),
      },
      data: { status: parsed.data.status },
    })

    return apiSuccess({
      updatedCount: result.count,
      status: parsed.data.status,
    })
  } catch (error) {
    logApiError("[ADMIN_BULK_ORDER_STATUS_POST]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
