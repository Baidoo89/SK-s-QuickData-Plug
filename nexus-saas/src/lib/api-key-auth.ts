import { db } from "@/lib/db"

export type ApiKeyAuthResult = {
  apiKeyId: string
  apiKeyName: string
  organizationId: string
  ownerType: "SUBSCRIBER" | "AGENT" | "RESELLER"
  ownerUserId: string | null
  ownerAgentId: string | null
}

function extractBearerToken(req: Request) {
  const authorization = req.headers.get("authorization") || ""
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || req.headers.get("x-api-key")?.trim() || null
}

export async function authenticateApiKey(req: Request): Promise<ApiKeyAuthResult | null> {
  const token = extractBearerToken(req)
  if (!token) return null

  const apiKey = await db.apiKey.findUnique({
    where: { key: token },
    select: {
      id: true,
      name: true,
      organizationId: true,
      ownerType: true,
      ownerUserId: true,
      ownerAgentId: true,
    },
  })

  if (!apiKey) return null

  await db.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsed: new Date() },
  })

  return {
    apiKeyId: apiKey.id,
    apiKeyName: apiKey.name,
    organizationId: apiKey.organizationId,
    ownerType: apiKey.ownerType === "AGENT" || apiKey.ownerType === "RESELLER" ? apiKey.ownerType : "SUBSCRIBER",
    ownerUserId: apiKey.ownerUserId,
    ownerAgentId: apiKey.ownerAgentId,
  }
}
