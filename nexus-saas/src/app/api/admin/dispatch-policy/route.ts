import { requireAdmin, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { getEffectiveDispatchPolicy, saveDispatchPolicy } from "@/lib/dispatch-policy"
import { z } from "zod"

export const dynamic = "force-dynamic"

const updatePolicySchema = z.object({
  mode: z.enum(["MANUAL_ONLY", "API_ONLY", "HYBRID"]),
  apiEnabledNetworks: z.array(z.string()).default([]),
  providerName: z.string().min(1).default("Primary Provider"),
})

export async function GET() {
  try {
    const authResult = await requireAdmin()
    if (isAuthError(authResult)) {
      return authResult
    }

    if (!authResult.user.organizationId) {
      return ApiErrors.FORBIDDEN()
    }

    const organizationId = authResult.user.organizationId
    const policy = await getEffectiveDispatchPolicy(organizationId)
    return apiSuccess(policy)
  } catch (error) {
    logApiError("[DISPATCH_POLICY_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function PUT(req: Request) {
  try {
    const authResult = await requireAdmin()
    if (isAuthError(authResult)) {
      return authResult
    }

    if (!authResult.user.organizationId) {
      return ApiErrors.FORBIDDEN()
    }

    const organizationId = authResult.user.organizationId
    const body = await req.json()
    const parsed = updatePolicySchema.safeParse(body)

    if (!parsed.success) {
      return ApiErrors.VALIDATION_ERROR(parsed.error.flatten().fieldErrors)
    }

    const payload = await saveDispatchPolicy({
      organizationId,
      actorId: authResult.user.id,
      actorName: authResult.user.email,
      mode: parsed.data.mode,
      apiEnabledNetworks: parsed.data.apiEnabledNetworks,
      providerName: parsed.data.providerName,
    })

    return apiSuccess(payload, "Dispatch policy updated")
  } catch (error) {
    logApiError("[DISPATCH_POLICY_PUT]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
