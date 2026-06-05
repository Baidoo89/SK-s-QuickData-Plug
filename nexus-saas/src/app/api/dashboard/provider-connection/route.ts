import { z } from "zod"

import { requireOrgManager, isAuthError } from "@/lib/auth-guard"
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
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) return authResult

    const organizationId = authResult.user.organizationId!
    const providerKey = new URL(req.url).searchParams.get("providerKey") || "primary"
    const [record, connections] = await Promise.all([
      getStoredProviderConnection(organizationId, providerKey),
      listStoredProviderConnections(organizationId),
    ])

    return apiSuccess({
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
    })
  } catch (error) {
    logApiError("[DASHBOARD_PROVIDER_CONNECTION_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function PUT(req: Request) {
  try {
    const authResult = await requireOrgManager()
    if (isAuthError(authResult)) return authResult

    const body = await req.json().catch(() => null)
    const parsed = providerConnectionSchema.safeParse(body)

    if (!parsed.success) {
      return ApiErrors.VALIDATION_ERROR(parsed.error.flatten().fieldErrors)
    }

    const providerApiKey = parsed.data.providerApiKey.trim()
    const record = await upsertProviderConnection({
      organizationId: authResult.user.organizationId!,
      providerKey: parsed.data.providerKey,
      providerName: parsed.data.providerName.trim(),
      providerOrderUrl: parsed.data.providerOrderUrl.trim(),
      providerApiKey: providerApiKey.length > 0 ? providerApiKey : null,
      active: parsed.data.active,
      updatedById: authResult.user.id,
    })
    const connections = await listStoredProviderConnections(authResult.user.organizationId!)

    return apiSuccess(
      {
        providerKey: record?.providerKey || parsed.data.providerKey,
        providerName: record?.providerName || parsed.data.providerName.trim(),
        providerOrderUrl: record?.providerOrderUrl || parsed.data.providerOrderUrl.trim(),
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
      },
      "Provider connection updated"
    )
  } catch (error) {
    logApiError("[DASHBOARD_PROVIDER_CONNECTION_PUT]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
