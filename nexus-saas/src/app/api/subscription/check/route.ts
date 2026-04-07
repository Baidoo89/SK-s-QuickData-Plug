import { NextResponse } from "next/server"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"

export async function GET() {
  try {
    // Subscriptions are temporarily disabled; always report OK with no subscription.
    return apiSuccess({ ok: true, subscription: null })
  } catch (error) {
    logApiError("[SUBSCRIPTION_CHECK]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

