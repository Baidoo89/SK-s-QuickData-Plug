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

  if (!["SUBSCRIBER", "AGENT", "RESELLER"].includes(apiKey.ownerType)) return null
  const organization = await db.organization.findUnique({ where: { id: apiKey.organizationId }, select: { active: true } })
  if (!organization?.active) return null
  if (apiKey.ownerType !== "SUBSCRIBER" || apiKey.ownerUserId) {
    if (!apiKey.ownerUserId) return null
    const user = await db.user.findUnique({ where: { id: apiKey.ownerUserId } })
    if (!user || !user.active || user.signupStatus !== "APPROVED" || user.organizationId !== apiKey.organizationId) return null
    if (apiKey.ownerType === "SUBSCRIBER" && !["SUBSCRIBER", "SUPERADMIN"].includes(user.role)) return null
    if (apiKey.ownerType === "AGENT" && (user.role !== "AGENT" || user.agentId !== apiKey.ownerAgentId)) return null
    if (apiKey.ownerType === "RESELLER" && (user.role !== "RESELLER" || user.parentAgentId !== apiKey.ownerAgentId)) return null
    if (apiKey.ownerType !== "SUBSCRIBER") {
      if (!apiKey.ownerAgentId) return null
      const agent = await db.agent.findFirst({ where: { id: apiKey.ownerAgentId, organizationId: apiKey.organizationId, active: true }, select: { id: true } })
      if (!agent) return null
    }
  }
  const updated = await db.apiKey.updateMany({ where: { id: apiKey.id }, data: { lastUsed: new Date() } })
  if (!updated.count) return null

  return {
    apiKeyId: apiKey.id,
    apiKeyName: apiKey.name,
    organizationId: apiKey.organizationId,
    ownerType: apiKey.ownerType === "AGENT" || apiKey.ownerType === "RESELLER" ? apiKey.ownerType : "SUBSCRIBER",
    ownerUserId: apiKey.ownerUserId,
    ownerAgentId: apiKey.ownerAgentId,
  }
}
