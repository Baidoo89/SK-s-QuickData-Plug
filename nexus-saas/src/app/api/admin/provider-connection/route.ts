import { z } from "zod"

import { requireOrgManager, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { getStoredProviderConnection, upsertProviderConnection } from "@/lib/provider-connection"

const providerConnectionSchema = z.object({
  providerName: z.string().min(1).default("Primary Provider"),
  providerOrderUrl: z.string().min(1),
  providerApiKey: z.string().optional().default(""),
})

export async function GET() {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) {
      return authResult
    }

    const organizationId = authResult.user.organizationId!
    const record = await getStoredProviderConnection(organizationId)

    const payload = {
      providerName: record?.providerName || "Primary Provider",
      providerOrderUrl: record?.providerOrderUrl || "",
      providerApiKey: record?.providerApiKey ? "********" : "",
      hasApiKey: Boolean(record?.providerApiKey),
      updatedAt: record?.updatedAt ? new Date(record.updatedAt).toISOString() : null,
    }

    return apiSuccess(payload)
  } catch (error) {
    logApiError("[PROVIDER_CONNECTION_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function PUT(req: Request) {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) {
      return authResult
    }

    const organizationId = authResult.user.organizationId!
    const body = await req.json().catch(() => null)
    const parsed = providerConnectionSchema.safeParse(body)

    if (!parsed.success) {
      return ApiErrors.VALIDATION_ERROR(parsed.error.flatten().fieldErrors)
    }

    const providerApiKey = parsed.data.providerApiKey.trim()
    const data = {
      providerName: parsed.data.providerName.trim(),
      providerOrderUrl: parsed.data.providerOrderUrl.trim(),
      providerApiKey: providerApiKey.length > 0 ? providerApiKey : null,
      updatedById: authResult.user.id,
    }

    const record = await upsertProviderConnection({
      organizationId,
      ...data,
    })

    return apiSuccess(
      {
        providerName: record?.providerName || data.providerName,
        providerOrderUrl: record?.providerOrderUrl || data.providerOrderUrl,
        hasApiKey: Boolean(record?.providerApiKey),
        providerApiKey: record?.providerApiKey ? "********" : "",
        updatedAt: record?.updatedAt ? new Date(record.updatedAt).toISOString() : null,
      },
      "Provider connection updated"
    )
  } catch (error) {
    logApiError("[PROVIDER_CONNECTION_PUT]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
