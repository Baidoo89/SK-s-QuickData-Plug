import { db } from "@/lib/db"

export type ProviderConnection = {
  providerKey: string
  providerName: string
  providerOrderUrl: string | null
  providerApiKey: string | null
  active: boolean
}

type ProviderConnectionRow = {
  providerKey?: string | null
  providerName: string
  providerOrderUrl: string | null
  providerApiKey: string | null
  active?: boolean | null
  updatedAt: Date | string | null
}

export function normalizeProviderKey(value: string | null | undefined) {
  return (value || "primary")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/(^-|-$)+/g, "") || "primary"
}

export function getDefaultProviderConnection(): ProviderConnection {
  return {
    providerKey: "primary",
    providerName: process.env.DISPATCH_PROVIDER_NAME || "Primary Provider",
    providerOrderUrl: process.env.PROVIDER_ORDER_URL?.trim() || null,
    providerApiKey: process.env.PROVIDER_API_KEY?.trim() || null,
    active: true,
  }
}

function mapConnection(record: ProviderConnectionRow | null | undefined, fallback = getDefaultProviderConnection()): ProviderConnection | null {
  if (!record) return null

  return {
    providerKey: normalizeProviderKey(record.providerKey || fallback.providerKey),
    providerName: record.providerName?.trim() || fallback.providerName,
    providerOrderUrl: record.providerOrderUrl?.trim() || fallback.providerOrderUrl,
    providerApiKey: record.providerApiKey?.trim() || fallback.providerApiKey,
    active: record.active !== false,
  }
}

export async function getEffectiveProviderConnection(organizationId: string, providerKey = "primary"): Promise<ProviderConnection> {
  const fallback = getDefaultProviderConnection()
  const normalizedProviderKey = normalizeProviderKey(providerKey)

  try {
    const records = await db.$queryRaw<ProviderConnectionRow[]>`
      SELECT
        "providerKey",
        "providerName",
        "providerOrderUrl",
        "providerApiKey",
        "active",
        "updatedAt"
      FROM "ProviderConnection"
      WHERE "organizationId" = ${organizationId}
        AND "providerKey" = ${normalizedProviderKey}
        AND "active" = true
      LIMIT 1
    `

    const record = mapConnection(records[0], { ...fallback, providerKey: normalizedProviderKey })
    if (record) return record

    if (normalizedProviderKey !== "primary") {
      return getEffectiveProviderConnection(organizationId, "primary")
    }

    return fallback
  } catch {
    const record = await getStoredProviderConnection(organizationId)
    if (!record) return fallback
    return mapConnection(record, fallback) || fallback
  }
}

export async function listStoredProviderConnections(organizationId: string) {
  try {
    const records = await db.$queryRaw<ProviderConnectionRow[]>`
      SELECT
        "providerKey",
        "providerName",
        "providerOrderUrl",
        "providerApiKey",
        "active",
        "updatedAt"
      FROM "ProviderConnection"
      WHERE "organizationId" = ${organizationId}
      ORDER BY "priority" ASC, "updatedAt" DESC
    `

    return records.map((record) => mapConnection(record)).filter((record): record is ProviderConnection => Boolean(record))
  } catch {
    const record = await getStoredProviderConnection(organizationId)
    const mapped = mapConnection(record)
    return mapped ? [mapped] : []
  }
}

export async function getStoredProviderConnection(organizationId: string, providerKey = "primary") {
  const normalizedProviderKey = normalizeProviderKey(providerKey)

  try {
    const records = await db.$queryRaw<ProviderConnectionRow[]>`
      SELECT
        "providerKey",
        "providerName",
        "providerOrderUrl",
        "providerApiKey",
        "active",
        "updatedAt"
      FROM "ProviderConnection"
      WHERE "organizationId" = ${organizationId}
        AND "providerKey" = ${normalizedProviderKey}
      LIMIT 1
    `

    return records[0] || null
  } catch {
    if (normalizedProviderKey !== "primary") return null

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

    return records[0] || null
  }
}

export async function upsertProviderConnection(input: {
  organizationId: string
  providerKey?: string
  providerName: string
  providerOrderUrl: string
  providerApiKey: string | null
  active?: boolean
  updatedById: string
}) {
  const providerKey = normalizeProviderKey(input.providerKey)

  try {
    await db.$executeRaw`
      INSERT INTO "ProviderConnection" (
        "id",
        "organizationId",
        "providerKey",
        "providerName",
        "providerOrderUrl",
        "providerApiKey",
        "active",
        "updatedById",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${crypto.randomUUID()},
        ${input.organizationId},
        ${providerKey},
        ${input.providerName},
        ${input.providerOrderUrl},
        ${input.providerApiKey},
        ${input.active ?? true},
        ${input.updatedById},
        NOW(),
        NOW()
      )
      ON CONFLICT ("organizationId", "providerKey") DO UPDATE SET
        "providerName" = EXCLUDED."providerName",
        "providerOrderUrl" = EXCLUDED."providerOrderUrl",
        "providerApiKey" = COALESCE(NULLIF(EXCLUDED."providerApiKey", ''), "ProviderConnection"."providerApiKey"),
        "active" = EXCLUDED."active",
        "updatedById" = EXCLUDED."updatedById",
        "updatedAt" = NOW()
    `

    return getStoredProviderConnection(input.organizationId, providerKey)
  } catch {
    if (providerKey !== "primary") {
      throw new Error("Multiple provider slots require the provider connection database migration.")
    }

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
}
