import { NextResponse } from "next/server"
import { ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { ensureDefaultSaasPlan, getNextBillingDate, refreshOrganizationSubscriptionStatus } from "@/lib/subscription-access"
import { getSubscriptionPaystackSecret } from "@/lib/paystack"
import { getBaseUrl } from "@/lib/mail"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const reference = searchParams.get("reference")
    const baseUrl = getBaseUrl()

    if (!reference) {
      return ApiErrors.BAD_REQUEST("Missing reference")
    }

    const secret = getSubscriptionPaystackSecret()
    if (!secret) {
      return ApiErrors.INTERNAL_ERROR({ reason: "Paystack subscription billing is not configured" })
    }

    // Verify transaction with Paystack
    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${secret}`,
      },
    })

    if (!response.ok) {
      return ApiErrors.BAD_REQUEST("Payment verification failed")
    }

    const data = await response.json()

    if (!data.status || data.data.status !== "success") {
      return NextResponse.redirect(`${baseUrl}/pricing?error=payment_failed`)
    }

    const { organizationId, planId } = data.data.metadata

    if (!organizationId) {
      return ApiErrors.BAD_REQUEST("Invalid payment metadata")
    }

    const existingPayment = await db.payment.findUnique({ where: { paystackRef: reference } })
    if (existingPayment) {
      return NextResponse.redirect(`${baseUrl}/dashboard/subscription?subscription=active`)
    }

    const plan = planId
      ? await db.plan.findUnique({ where: { id: planId } })
      : await ensureDefaultSaasPlan()

    if (!plan) {
      return ApiErrors.BAD_REQUEST("Invalid payment metadata")
    }

    const existingSubscription = await refreshOrganizationSubscriptionStatus(organizationId)
    const nextBillingAt = getNextBillingDate(existingSubscription?.nextBillingAt)

    // Create or update subscription in DB
    const subscription = await db.subscription.upsert({
      where: { organizationId },
      update: {
        planId: plan.id,
        status: "ACTIVE",
        paystackRef: reference,
        nextBillingAt,
        updatedAt: new Date(),
      },
      create: {
        organizationId,
        planId: plan.id,
        status: "ACTIVE",
        paystackRef: reference,
        nextBillingAt,
      },
    })

    // Record payment
    await db.payment.create({
      data: {
        subscriptionId: subscription.id,
        amount: plan.priceGHS,
        paystackRef: reference,
        status: "SUCCESS",
        paidAt: new Date(),
      },
    })

    // Redirect to dashboard on success
    return NextResponse.redirect(`${baseUrl}/dashboard/subscription?subscription=active`)
  } catch (error) {
    logApiError("[PAYSTACK_VERIFY]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
