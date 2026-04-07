import { db } from "@/lib/db"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { reverseOrderProfitIfNeeded, reverseOrderWalletDebitIfNeeded } from "@/lib/order-wallet"
import { verifyProviderWebhookSignature } from "@/lib/provider-signature"
import { z } from "zod"

const callbackSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(["PENDING", "COMPLETED", "FAILED"]),
  externalRef: z.string().optional(),
  message: z.string().optional(),
})

export async function POST(req: Request) {
  try {
    const rawBody = await req.text()
    const signature = req.headers.get("x-provider-signature")
    const headerSecret = req.headers.get("x-provider-secret")?.trim()
    const legacySecret = process.env.PROVIDER_WEBHOOK_SECRET?.trim()
    const hmacSecret = process.env.PROVIDER_WEBHOOK_HMAC_SECRET?.trim() || legacySecret

    const hmacOk = verifyProviderWebhookSignature({
      rawBody,
      signatureHeader: signature,
      sharedSecret: hmacSecret,
    })

    const legacyHeaderOk = Boolean(legacySecret && headerSecret && headerSecret === legacySecret)

    if (!hmacOk && !legacyHeaderOk) {
      return ApiErrors.FORBIDDEN()
    }

    const body = rawBody ? JSON.parse(rawBody) : null
    const parsed = callbackSchema.safeParse(body)
    if (!parsed.success) {
      return ApiErrors.VALIDATION_ERROR(parsed.error.flatten().fieldErrors)
    }

    const { orderId, status, externalRef, message } = parsed.data

    const existing = await db.order.findUnique({
      where: { id: orderId },
      select: { id: true, organizationId: true, status: true },
    })

    if (!existing) {
      return ApiErrors.NOT_FOUND("Order")
    }

    const updated = await db.order.update({
      where: { id: orderId },
      data: { status },
      select: { id: true, status: true },
    })

    if (status === "FAILED") {
      await reverseOrderWalletDebitIfNeeded({
        orderId,
        organizationId: existing.organizationId,
        reason: "Provider callback failed",
      })

      await reverseOrderProfitIfNeeded({
        orderId,
        organizationId: existing.organizationId,
        previousStatus: existing.status,
        reason: "Provider callback failed",
      })
    }

    await db.auditLog.create({
      data: {
        action: "ORDER_PROVIDER_CALLBACK",
        targetType: "ORDER",
        targetId: orderId,
        organizationId: existing.organizationId,
        meta: JSON.stringify({
          previousStatus: existing.status,
          status,
          externalRef: externalRef || null,
          message: message || null,
        }),
      },
    })

    return apiSuccess(updated)
  } catch (error) {
    logApiError("[PROVIDER_CALLBACK_POST]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
