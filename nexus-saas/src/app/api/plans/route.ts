import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { listSaasPlans } from "@/lib/subscription-access"
import { toPublicSaasPlan } from "@/lib/saas-plans"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const plans = await listSaasPlans()
    return apiSuccess(plans.map((plan) => toPublicSaasPlan(plan)))
  } catch (error) {
    logApiError("[PLANS_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
