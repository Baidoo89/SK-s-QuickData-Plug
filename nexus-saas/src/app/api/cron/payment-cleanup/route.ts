import { ApiErrors, apiSuccess, logApiError } from "@/lib/api-response"
import { expireAbandonedStorefrontPayments } from "@/lib/storefront-payment-cleanup"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== "production"

  const authorization = req.headers.get("authorization") || ""
  const headerSecret = req.headers.get("x-cron-secret") || ""
  return authorization === `Bearer ${secret}` || headerSecret === secret
}

export async function GET(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return ApiErrors.UNAUTHORIZED()
    }

    const result = await expireAbandonedStorefrontPayments()
    return apiSuccess(result, "Abandoned storefront payments expired")
  } catch (error) {
    logApiError("[PAYMENT_CLEANUP_CRON]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function POST(req: Request) {
  return GET(req)
}
