import { db } from "@/lib/db"

export type ProviderConnection = {
  providerName: string
  providerOrderUrl: string | null
  providerApiKey: string | null
}

type ProviderConnectionRow = {
  providerName: string
  providerOrderUrl: string | null
  providerApiKey: string | null
  updatedAt: Date | string | null
}

export function getDefaultProviderConnection(): ProviderConnection {
  return {
    providerName: process.env.DISPATCH_PROVIDER_NAME || "Primary Provider",
    providerOrderUrl: process.env.PROVIDER_ORDER_URL?.trim() || null,
    providerApiKey: process.env.PROVIDER_API_KEY?.trim() || null,
  }
}

export async function getEffectiveProviderConnection(organizationId: string): Promise<ProviderConnection> {
  const fallback = getDefaultProviderConnection()

  const records = await db.$queryRaw<ProviderConnectionRow[]>`
    SELECT
      "providerName",
      "providerOrderUrl",
      "providerApiKey",
      "updatedAt"
    FROM "ProviderConnection"
    WHERE "organizationId" = ${organizationId}
    LIMIT 1
  `

  const record = records[0]

  if (!record) {
    return fallback
  }

  return {
    providerName: record.providerName?.trim() || fallback.providerName,
    providerOrderUrl: record.providerOrderUrl?.trim() || fallback.providerOrderUrl,
    providerApiKey: record.providerApiKey?.trim() || fallback.providerApiKey,
  }
}

export async function getStoredProviderConnection(organizationId: string) {
  const records = await db.$queryRaw<ProviderConnectionRow[]>`
    SELECT
      "providerName",
      "providerOrderUrl",
      "providerApiKey",
      "updatedAt"
    FROM "ProviderConnection"
    WHERE "organizationId" = ${organizationId}
    LIMIT 1
  `

  const record = records[0]

  return record || null
}

export async function upsertProviderConnection(input: {
  organizationId: string
  providerName: string
  providerOrderUrl: string
  providerApiKey: string | null
  updatedById: string
}) {
  await db.$executeRaw`
    INSERT INTO "ProviderConnection" (
      "id",
      "organizationId",
      "providerName",
      "providerOrderUrl",
      "providerApiKey",
      "updatedById",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${crypto.randomUUID()},
      ${input.organizationId},
      ${input.providerName},
      ${input.providerOrderUrl},
      ${input.providerApiKey},
      ${input.updatedById},
      NOW(),
      NOW()
    )
    ON CONFLICT ("organizationId") DO UPDATE SET
      "providerName" = EXCLUDED."providerName",
      "providerOrderUrl" = EXCLUDED."providerOrderUrl",
      "providerApiKey" = COALESCE(NULLIF(EXCLUDED."providerApiKey", ''), "ProviderConnection"."providerApiKey"),
      "updatedById" = EXCLUDED."updatedById",
      "updatedAt" = NOW()
  `

  return getStoredProviderConnection(input.organizationId)
}
