import { z } from "zod"

import { requireAdmin, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { getStoredProviderConnection, listStoredProviderConnections, upsertProviderConnection } from "@/lib/provider-connection"

export const dynamic = "force-dynamic"

const providerConnectionSchema = z.object({
  providerKey: z.string().optional().default("primary"),
  providerName: z.string().min(1).default("Primary Provider"),
  providerOrderUrl: z.string().min(1),
  providerApiKey: z.string().optional().default(""),
  active: z.boolean().optional().default(true),
})

export async function GET(req: Request) {
  try {
    const authResult = await requireAdmin()
    if (isAuthError(authResult)) {
      return authResult
    }

    const organizationId = authResult.user.organizationId!
    const providerKey = new URL(req.url).searchParams.get("providerKey") || "primary"
    const [record, connections] = await Promise.all([
      getStoredProviderConnection(organizationId, providerKey),
      listStoredProviderConnections(organizationId),
    ])

    const payload = {
      providerKey: record?.providerKey || providerKey,
      providerName: record?.providerName || "Primary Provider",
      providerOrderUrl: record?.providerOrderUrl || "",
      providerApiKey: record?.providerApiKey ? "********" : "",
      hasApiKey: Boolean(record?.providerApiKey),
      active: record?.active !== false,
      updatedAt: record?.updatedAt ? new Date(record.updatedAt).toISOString() : null,
      connections: connections.map((connection) => ({
        providerKey: connection.providerKey,
        providerName: connection.providerName,
        providerOrderUrl: connection.providerOrderUrl,
        hasApiKey: Boolean(connection.providerApiKey),
        active: connection.active,
      })),
    }

    return apiSuccess(payload)
  } catch (error) {
    logApiError("[PROVIDER_CONNECTION_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function PUT(req: Request) {
  try {
    const authResult = await requireAdmin()
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
      providerKey: parsed.data.providerKey,
      active: parsed.data.active,
      updatedById: authResult.user.id,
    }

    const record = await upsertProviderConnection({
      organizationId,
      ...data,
    })
    const connections = await listStoredProviderConnections(organizationId)

    return apiSuccess(
      {
        providerKey: record?.providerKey || data.providerKey,
        providerName: record?.providerName || data.providerName,
        providerOrderUrl: record?.providerOrderUrl || data.providerOrderUrl,
        hasApiKey: Boolean(record?.providerApiKey),
        providerApiKey: record?.providerApiKey ? "********" : "",
        active: record?.active !== false,
        updatedAt: record?.updatedAt ? new Date(record.updatedAt).toISOString() : null,
        connections: connections.map((connection) => ({
          providerKey: connection.providerKey,
          providerName: connection.providerName,
          providerOrderUrl: connection.providerOrderUrl,
          hasApiKey: Boolean(connection.providerApiKey),
          active: connection.active,
        })),
      },
      "Provider connection updated"
    )
  } catch (error) {
    logApiError("[PROVIDER_CONNECTION_PUT]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
