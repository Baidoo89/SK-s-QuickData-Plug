import { requireAuthAndOrg, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { getNextBillingDate, getSaasPlanForCheckout, refreshOrganizationSubscriptionStatus } from "@/lib/subscription-access"
import { getSubscriptionPaystackSecret } from "@/lib/paystack"
import { getBaseUrl } from "@/lib/mail"

export async function POST(req: Request) {
  try {
    const authResult = await requireAuthAndOrg()
    if (isAuthError(authResult)) {
      return authResult
    }

    const { planId, planCode } = await req.json().catch(() => ({}))
    const explicitPlanId = typeof planId === "string" && planId.trim() ? planId.trim() : null
    const requestedPlan =
      explicitPlanId ??
      (typeof planCode === "string" && planCode.trim()
        ? planCode.trim()
        : undefined)
    const plan = explicitPlanId
      ? await db.plan.findUnique({ where: { id: explicitPlanId } })
      : await getSaasPlanForCheckout(requestedPlan)

    if (!plan || !plan.active || !plan.visible || plan.retiredAt) {
      return ApiErrors.BAD_REQUEST("This plan is no longer available for checkout.")
    }
    const user = await db.user.findUnique({
      where: { id: authResult.user.id },
      include: { organization: true },
    })

    if (!user?.organizationId) {
      return ApiErrors.NOT_FOUND("Organization")
    }

    const existingSub = await refreshOrganizationSubscriptionStatus(user.organizationId)

    const secret = getSubscriptionPaystackSecret()
    const baseUrl = getBaseUrl()

    if (!secret) {
      if (process.env.NODE_ENV !== "production") {
        const reference = `DEV-SUB-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const subscription = await db.subscription.upsert({
          where: { organizationId: user.organizationId },
          update: {
            planId: plan.id,
            status: "ACTIVE",
            paystackRef: reference,
            nextBillingAt: getNextBillingDate(existingSub?.nextBillingAt),
            updatedAt: new Date(),
          },
          create: {
            organizationId: user.organizationId,
            planId: plan.id,
            status: "ACTIVE",
            paystackRef: reference,
            nextBillingAt: getNextBillingDate(),
          },
        })

        await db.payment.create({
          data: {
            subscriptionId: subscription.id,
            amount: plan.priceGHS,
            paystackRef: reference,
            status: "SUCCESS",
            paidAt: new Date(),
          },
        })

        return apiSuccess(
          {
            devActivated: true,
            redirectUrl: "/dashboard/setup?subscription=dev-active",
            plan: { name: plan.name, priceGHS: plan.priceGHS },
          },
          "Development subscription activated. Configure Paystack before production launch.",
        )
      }

      return ApiErrors.BAD_REQUEST("Subscription billing is not configured. Add PAYSTACK_SUBSCRIPTION_SECRET_KEY before taking live payments.")
    }

    // Convert GHS to pesewas (1 GHS = 100 pesewas)
    const amountInPesewas = Math.round(plan.priceGHS * 100)

    // Initialize Paystack payment
    const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        amount: amountInPesewas,
        metadata: {
          organizationId: user.organizationId,
          planId: plan.id,
          planName: plan.name,
          orgName: user.organization?.name,
        },
        callback_url: `${baseUrl}/api/paystack/verify`,
      }),
    })

    if (!paystackResponse.ok) {
      logApiError("PAYSTACK_INIT_ERROR", await paystackResponse.text())
      return ApiErrors.INTERNAL_ERROR()
    }

    const paystackData = await paystackResponse.json()

    if (!paystackData.status) {
      return ApiErrors.INTERNAL_ERROR()
    }

    return apiSuccess({
      authorizationUrl: paystackData.data.authorization_url,
      accessCode: paystackData.data.access_code,
      reference: paystackData.data.reference,
    })
  } catch (error) {
    logApiError("[PAYSTACK_CHECKOUT]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
