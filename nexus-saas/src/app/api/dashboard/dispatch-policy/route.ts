import { z } from "zod"

import { requireOrgManager, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { getEffectiveDispatchPolicy, saveDispatchPolicy } from "@/lib/dispatch-policy"

export const dynamic = "force-dynamic"

const updatePolicySchema = z.object({
  mode: z.enum(["MANUAL_ONLY", "API_ONLY", "HYBRID"]),
  apiEnabledNetworks: z.array(z.string()).default([]),
  providerKey: z.string().optional().default("primary"),
  providerName: z.string().min(1).default("Primary Provider"),
  networkProviderMap: z.record(z.string(), z.string()).optional().default({}),
})

export async function GET() {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) return authResult

    const policy = await getEffectiveDispatchPolicy(authResult.user.organizationId!)
    return apiSuccess(policy)
  } catch (error) {
    logApiError("[DASHBOARD_DISPATCH_POLICY_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function PUT(req: Request) {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) return authResult

    const body = await req.json().catch(() => null)
    const parsed = updatePolicySchema.safeParse(body)

    if (!parsed.success) {
      return ApiErrors.VALIDATION_ERROR(parsed.error.flatten().fieldErrors)
    }

    const policy = await saveDispatchPolicy({
      organizationId: authResult.user.organizationId!,
      actorId: authResult.user.id,
      actorName: authResult.user.email,
      mode: parsed.data.mode,
      apiEnabledNetworks: parsed.data.apiEnabledNetworks,
      providerKey: parsed.data.providerKey,
      providerName: parsed.data.providerName,
      networkProviderMap: parsed.data.networkProviderMap,
    })

    return apiSuccess(policy, "Dispatch policy updated")
  } catch (error) {
    logApiError("[DASHBOARD_DISPATCH_POLICY_PUT]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
