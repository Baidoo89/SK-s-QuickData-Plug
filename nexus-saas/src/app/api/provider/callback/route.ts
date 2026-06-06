import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { verifyProviderWebhookSignature } from "@/lib/provider-signature"
import { applyProviderStatusUpdate, findOrderByProviderReference, normalizeProviderOrderStatus } from "@/lib/provider-status"
import { z } from "zod"

const genericCallbackSchema = z.object({
  orderId: z.string().min(1).optional(),
  status: z.string().min(1),
  externalRef: z.string().optional(),
  order_id: z.string().optional(),
  message: z.string().optional(),
})

export async function POST(req: Request) {
  try {
    const rawBody = await req.text()
    const url = new URL(req.url)
    const signature = req.headers.get("x-provider-signature")
    const skPlugSignature = req.headers.get("x-skplug-signature")
    const headerSecret = req.headers.get("x-provider-secret")?.trim()
    const querySecret = url.searchParams.get("secret")?.trim()
    const legacySecret = process.env.PROVIDER_WEBHOOK_SECRET?.trim() || process.env.SKPLUG_WEBHOOK_SECRET?.trim()
    const hmacSecret = process.env.PROVIDER_WEBHOOK_HMAC_SECRET?.trim() || legacySecret

    const hmacOk = verifyProviderWebhookSignature({
      rawBody,
      signatureHeader: signature || skPlugSignature,
      sharedSecret: hmacSecret,
    })

    const legacyHeaderOk = Boolean(legacySecret && headerSecret && headerSecret === legacySecret)
    const querySecretOk = Boolean(legacySecret && querySecret && querySecret === legacySecret)

    if (!hmacOk && !legacyHeaderOk && !querySecretOk) {
      return ApiErrors.FORBIDDEN()
    }

    const body = rawBody ? JSON.parse(rawBody) : null
    const parsed = genericCallbackSchema.safeParse(body)
    if (!parsed.success) {
      return ApiErrors.VALIDATION_ERROR(parsed.error.flatten().fieldErrors)
    }

    const externalRef = parsed.data.externalRef || parsed.data.order_id || null
    const status = normalizeProviderOrderStatus(parsed.data.status)
    const message = parsed.data.message
    let orderId = parsed.data.orderId

    if (!orderId && externalRef) {
      const matchedOrder = await findOrderByProviderReference(externalRef)
      orderId = matchedOrder?.id
    }

    if (!orderId) {
      return ApiErrors.NOT_FOUND("Order")
    }

    const updated = await applyProviderStatusUpdate({
      orderId,
      status,
      externalRef,
      message,
      source: "callback",
    })

    if (!updated) return ApiErrors.NOT_FOUND("Order")

    return apiSuccess(updated)
  } catch (error) {
    logApiError("[PROVIDER_CALLBACK_POST]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
