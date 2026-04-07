import { requireAuthAndOrg, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"

const PLANS: Record<string, { name: string; priceGHS: number; maxProducts: number; maxAgents: number }> = {
  starter: { name: "Starter", priceGHS: 99, maxProducts: 10, maxAgents: 5 },
  professional: { name: "Professional", priceGHS: 299, maxProducts: 50, maxAgents: 20 },
  enterprise: { name: "Enterprise", priceGHS: 799, maxProducts: 999999, maxAgents: 999999 },
}

export async function POST(req: Request) {
  try {
    const authResult = await requireAuthAndOrg()
    if (isAuthError(authResult)) {
      return authResult
    }

    const { planId } = await req.json()

    if (!planId || !PLANS[planId]) {
      return ApiErrors.BAD_REQUEST("Invalid plan")
    }

    const plan = PLANS[planId]
    const user = await db.user.findUnique({
      where: { id: authResult.user.id },
      include: { organization: true },
    })

    if (!user?.organizationId) {
      return ApiErrors.NOT_FOUND("Organization")
    }

    // Check if org already has active subscription
    const existingSub = await db.subscription.findUnique({
      where: { organizationId: user.organizationId },
    })

    if (existingSub?.status === "ACTIVE") {
      return ApiErrors.CONFLICT("Already has active subscription")
    }

    // Convert GHS to pesewas (1 GHS = 100 pesewas)
    const amountInPesewas = Math.round(plan.priceGHS * 100)

    // Initialize Paystack payment
    const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        amount: amountInPesewas,
        metadata: {
          organizationId: user.organizationId,
          planId,
          orgName: user.organization?.name,
        },
        callback_url: `${process.env.NEXTAUTH_URL}/api/paystack/verify`,
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
