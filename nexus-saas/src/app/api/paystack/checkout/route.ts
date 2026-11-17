import { requireOrgManager, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { getSaasPlanForCheckout } from "@/lib/subscription-access"
import { createSubscriptionQuote } from "@/lib/subscription-payment"
import { getSubscriptionPaystackSecret } from "@/lib/paystack"
import { getBaseUrl } from "@/lib/mail"

export async function POST(req: Request) {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) return authResult
    const secret = getSubscriptionPaystackSecret()
    const baseUrl = getBaseUrl()
    if (!secret) return ApiErrors.BAD_REQUEST("Subscription billing is not configured. Configure test billing keys for local checkout.")
    if (!baseUrl) return ApiErrors.INTERNAL_ERROR({ reason: "App URL not configured" })
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") return ApiErrors.BAD_REQUEST("Invalid checkout request")
    const explicitPlanId = typeof body.planId === "string" && body.planId.trim() ? body.planId.trim() : null
    const plan = explicitPlanId ? await db.plan.findUnique({ where: { id: explicitPlanId } }) : await getSaasPlanForCheckout(typeof body.planCode === "string" ? body.planCode.trim() : undefined)
    if (!plan) return ApiErrors.BAD_REQUEST("This plan is no longer available for checkout.")
    const quote = await createSubscriptionQuote(authResult.user, plan.id)
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: quote.email, amount: quote.amountMinor, currency: "GHS", reference: quote.reference, metadata: { purpose: "platform_subscription", organizationId: quote.organizationId, planId: quote.planId, planName: quote.planName }, callback_url: `${baseUrl}/api/paystack/verify` }),
    })
    const result = await response.json().catch(() => null)
    if (!response.ok || !result?.status || result.data?.reference !== quote.reference || !result.data?.authorization_url || !result.data?.access_code) {
      await db.subscriptionCheckout.updateMany({ where: { reference: quote.reference, status: "PENDING" }, data: { status: "FAILED" } })
      return ApiErrors.BAD_REQUEST("Could not initialize subscription payment. Please try again.")
    }
    return apiSuccess({ authorizationUrl: result.data.authorization_url, accessCode: result.data.access_code, reference: quote.reference, expiresAt: quote.expiresAt.toISOString() })
  } catch (error) {
    if (error instanceof Error && error.message === "SUBSCRIPTION_CHECKOUT_FORBIDDEN") return ApiErrors.FORBIDDEN()
    if (error instanceof Error && ["INVALID_SUBSCRIPTION_QUOTE", "INVALID_MONEY"].includes(error.message)) return ApiErrors.BAD_REQUEST("The selected plan needs review before payment.")
    logApiError("[PAYSTACK_CHECKOUT]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
