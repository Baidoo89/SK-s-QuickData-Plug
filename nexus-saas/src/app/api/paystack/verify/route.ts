import { NextResponse } from "next/server"
import { ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"

const PLANS: Record<string, { name: string; priceGHS: number; maxProducts: number; maxAgents: number }> = {
  starter: { name: "Starter", priceGHS: 99, maxProducts: 10, maxAgents: 5 },
  professional: { name: "Professional", priceGHS: 299, maxProducts: 50, maxAgents: 20 },
  enterprise: { name: "Enterprise", priceGHS: 799, maxProducts: 999999, maxAgents: 999999 },
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const reference = searchParams.get("reference")

    if (!reference) {
      return ApiErrors.BAD_REQUEST("Missing reference")
    }

    // Verify transaction with Paystack
    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
    })

    if (!response.ok) {
      return ApiErrors.BAD_REQUEST("Payment verification failed")
    }

    const data = await response.json()

    if (!data.status || data.data.status !== "success") {
      return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/pricing?error=payment_failed`)
    }

    const { organizationId, planId } = data.data.metadata

    if (!organizationId || !planId || !PLANS[planId]) {
      return ApiErrors.BAD_REQUEST("Invalid payment metadata")
    }

    const plan = PLANS[planId]

    // Create or update subscription in DB
    const subscription = await db.subscription.upsert({
      where: { organizationId },
      update: {
        planId,
        status: "ACTIVE",
        paystackRef: reference,
        nextBillingAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        updatedAt: new Date(),
      },
      create: {
        organizationId,
        planId,
        status: "ACTIVE",
        paystackRef: reference,
        nextBillingAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/dashboard?subscription=active`)
  } catch (error) {
    logApiError("[PAYSTACK_VERIFY]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
