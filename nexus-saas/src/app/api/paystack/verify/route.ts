import { db } from "@/lib/db"
import { recordFinancialReview } from "@/lib/financial-review"
import { NextResponse } from "next/server"
import { ApiErrors, logApiError } from "@/lib/api-response"
import { settleSubscriptionPayment } from "@/lib/subscription-payment"
import { getSubscriptionPaystackSecret } from "@/lib/paystack"
import { getBaseUrl } from "@/lib/mail"
export const dynamic = "force-dynamic"
export async function GET(req: Request) {
  let verifiedSuccess = false
  let reviewReference: string | null = null
  try {
    const reference = new URL(req.url).searchParams.get("reference")
    reviewReference = reference
    const baseUrl = getBaseUrl()
    if (!reference) return ApiErrors.BAD_REQUEST("Missing reference")
    if (!baseUrl) return ApiErrors.INTERNAL_ERROR({ reason: "App URL not configured" })
    const secret = getSubscriptionPaystackSecret()
    if (!secret) return ApiErrors.INTERNAL_ERROR({ reason: "Paystack subscription billing is not configured" })
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secret}` } })
    if (!response.ok) return ApiErrors.BAD_REQUEST("Payment verification failed")
    const result = await response.json().catch(() => null)
    if (!result?.status || result.data?.status !== "success") return NextResponse.redirect(`${baseUrl}/pricing?error=payment_failed`)
    verifiedSuccess = true
    await settleSubscriptionPayment(reference, result.data)
    return NextResponse.redirect(`${baseUrl}/dashboard/subscription?subscription=active`)
  } catch (error) {
    if (verifiedSuccess && reviewReference && error instanceof Error && ["INVALID_SUBSCRIPTION_PAYMENT", "SUBSCRIPTION_PAYMENT_NEEDS_REVIEW", "SUBSCRIPTION_QUOTE_EXPIRED", "INVALID_MONEY"].includes(error.message)) {
      try {
        const quote = await db.subscriptionCheckout.findUnique({ where: { reference: reviewReference } })
        const reason = error.message === "SUBSCRIPTION_QUOTE_EXPIRED"
          ? "Verified subscription payment arrived after its saved quote expired. Reconcile the gateway payment before applying access."
          : quote
            ? "Verified subscription payment does not match its saved quote. Reconcile the gateway payment."
            : "A successful platform payment has no saved checkout quote. Platform review is required."
        await recordFinancialReview({ kind: "SUBSCRIPTION_PAYMENT", organizationId: quote?.organizationId ?? null, targetType: quote ? "SUBSCRIPTION_CHECKOUT" : "PAYMENT_REFERENCE", targetId: quote?.reference ?? reviewReference, reference: reviewReference, reason })
      } catch (recordError) { logApiError("SUBSCRIPTION_REVIEW_RECORD", recordError) }
    }
    if (error instanceof Error && error.message === "SUBSCRIPTION_QUOTE_EXPIRED") return ApiErrors.BAD_REQUEST("This subscription quote expired. The payment was saved for platform review and access was not activated.")
    if (error instanceof Error && ["INVALID_SUBSCRIPTION_PAYMENT", "INVALID_MONEY"].includes(error.message)) return ApiErrors.BAD_REQUEST("Payment does not match a saved subscription checkout.")
    logApiError("[PAYSTACK_VERIFY]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
