import { requireOrgManager, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { getEffectiveDispatchPolicy } from "@/lib/dispatch-policy"
import { db } from "@/lib/db"
import { z } from "zod"

const updatePolicySchema = z.object({
  mode: z.enum(["MANUAL_ONLY", "API_ONLY", "HYBRID"]),
  apiEnabledNetworks: z.array(z.string()).default([]),
  providerName: z.string().min(1).default("Primary Provider"),
})

export async function GET() {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) {
      return authResult
    }

    const organizationId = authResult.user.organizationId!
    const policy = await getEffectiveDispatchPolicy(organizationId)
    return apiSuccess(policy)
  } catch (error) {
    logApiError("[DISPATCH_POLICY_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function PUT(req: Request) {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) {
      return authResult
    }

    const organizationId = authResult.user.organizationId!
    const body = await req.json()
    const parsed = updatePolicySchema.safeParse(body)

    if (!parsed.success) {
      return ApiErrors.VALIDATION_ERROR(parsed.error.flatten().fieldErrors)
    }

    const payload = {
      mode: parsed.data.mode,
      apiEnabledNetworks: parsed.data.apiEnabledNetworks.map((n) => n.trim().toUpperCase()).filter(Boolean),
      providerName: parsed.data.providerName.trim(),
    }

    await db.auditLog.create({
      data: {
        actorId: authResult.user.id,
        actorName: authResult.user.email,
        action: "DISPATCH_POLICY_SET",
        targetType: "SYSTEM_CONFIG",
        targetId: "dispatch-policy",
        organizationId,
        meta: JSON.stringify(payload),
      },
    })

    return apiSuccess(payload, "Dispatch policy updated")
  } catch (error) {
    logApiError("[DISPATCH_POLICY_PUT]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
