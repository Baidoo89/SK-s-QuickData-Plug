import { NextResponse } from "next/server"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { createStorefrontCheckout, isStorefrontCheckoutError } from "@/lib/storefront-checkout"

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)

    const checkout = await createStorefrontCheckout({
      subscriberSlug: body?.subscriberSlug,
      agentId: body?.agentId,
      resellerId: body?.resellerId,
      returnPath: body?.returnPath,
      items: Array.isArray(body?.items) ? body.items : [],
    })

    return apiSuccess(checkout, "Payment checkout created", 201)
  } catch (error) {
    if (isStorefrontCheckoutError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "STOREFRONT_CHECKOUT_ERROR",
            message: error.message,
          },
        },
        { status: error.status },
      )
    }

    logApiError("[STORE_CHECKOUT]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
