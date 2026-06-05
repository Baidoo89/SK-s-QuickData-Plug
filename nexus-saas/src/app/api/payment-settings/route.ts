import { z } from "zod"
import { requireOrgManager, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import {
  getOrganizationPaymentSettings,
  upsertOrganizationPaymentSettings,
} from "@/lib/organization-payment-settings"

export const dynamic = "force-dynamic"

const paymentSettingsSchema = z.object({
  paystackPublicKey: z.string().min(1, "Paystack public key is required"),
  paystackSecretKey: z.string().optional().default(""),
})

export async function GET() {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) return authResult

    const settings = await getOrganizationPaymentSettings(authResult.user.organizationId!)

    return apiSuccess({
      paystackPublicKey: settings.paystackPublicKey,
      hasPaystackSecretKey: Boolean(settings.paystackSecretKey),
      paystackConnected: settings.paystackConnected,
      updatedAt: settings.updatedAt ? new Date(settings.updatedAt).toISOString() : null,
    })
  } catch (error) {
    logApiError("[PAYMENT_SETTINGS_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function PUT(req: Request) {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) return authResult

    const body = await req.json().catch(() => null)
    const parsed = paymentSettingsSchema.safeParse(body)

    if (!parsed.success) {
      return ApiErrors.VALIDATION_ERROR(parsed.error.flatten().fieldErrors)
    }

    const settings = await upsertOrganizationPaymentSettings({
      organizationId: authResult.user.organizationId!,
      paystackPublicKey: parsed.data.paystackPublicKey.trim(),
      paystackSecretKey: parsed.data.paystackSecretKey.trim() || null,
      updatedById: authResult.user.id,
    })

    return apiSuccess(
      {
        paystackPublicKey: settings.paystackPublicKey,
        hasPaystackSecretKey: Boolean(settings.paystackSecretKey),
        paystackConnected: settings.paystackConnected,
        updatedAt: settings.updatedAt ? new Date(settings.updatedAt).toISOString() : null,
      },
      "Payment settings updated"
    )
  } catch (error) {
    logApiError("[PAYMENT_SETTINGS_PUT]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
