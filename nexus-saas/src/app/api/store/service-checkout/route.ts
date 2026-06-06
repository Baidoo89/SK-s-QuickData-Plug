import { NextResponse } from "next/server"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import {
  createStorefrontServiceCheckout,
  isStorefrontServiceCheckoutError,
} from "@/lib/storefront-service-checkout"

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)

    const checkout = await createStorefrontServiceCheckout({
      subscriberSlug: body?.subscriberSlug,
      agentId: body?.agentId,
      resellerId: body?.resellerId,
      returnPath: body?.returnPath,
      returnUrl: body?.returnUrl,
      productId: body?.productId,
      customerName: body?.customerName,
      phoneNumber: body?.phoneNumber,
      formValues: body?.formValues,
      location: body?.location,
      dateOfBirth: body?.dateOfBirth,
      ghanaCardNumber: body?.ghanaCardNumber,
    })

    return apiSuccess(checkout, "Service checkout created", 201)
  } catch (error) {
    if (isStorefrontServiceCheckoutError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "STOREFRONT_SERVICE_CHECKOUT_ERROR",
            message: error.message,
          },
        },
        { status: error.status },
      )
    }

    logApiError("[STORE_SERVICE_CHECKOUT]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
