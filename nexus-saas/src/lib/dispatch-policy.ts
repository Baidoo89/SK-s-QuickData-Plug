import { db } from "@/lib/db"

export type DispatchMode = "MANUAL_ONLY" | "API_ONLY" | "HYBRID"

export type DispatchPolicy = {
  mode: DispatchMode
  apiEnabledNetworks: string[]
  providerKey: string
  providerName: string
  networkProviderMap: Record<string, string>
}

export type SaveDispatchPolicyInput = {
  organizationId: string
  actorId: string
  actorName: string
  mode: DispatchMode
  apiEnabledNetworks: string[]
  providerKey?: string
  providerName: string
  networkProviderMap?: Record<string, string>
}

const VALID_MODES: DispatchMode[] = ["MANUAL_ONLY", "API_ONLY", "HYBRID"]

function normalizeNetwork(value: string): string {
  return value.trim().toUpperCase()
}

function normalizeProviderKey(value: string | undefined): string {
  return (value || "primary")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/(^-|-$)+/g, "") || "primary"
}

function normalizeProviderChain(value: string | undefined): string {
  const keys = (value || "primary")
    .split(">")
    .map((part) => normalizeProviderKey(part))
    .filter(Boolean)

  return Array.from(new Set(keys)).join(">") || "primary"
}

export function parseProviderChain(value: string | undefined): string[] {
  return normalizeProviderChain(value)
    .split(">")
    .map((part) => normalizeProviderKey(part))
    .filter(Boolean)
}

function parseCsvNetworks(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(",")
    .map(normalizeNetwork)
    .filter(Boolean)
}

export function getDefaultDispatchPolicy(): DispatchPolicy {
  const envMode = (process.env.DISPATCH_MODE || "HYBRID").toUpperCase()
  const mode = VALID_MODES.includes(envMode as DispatchMode)
    ? (envMode as DispatchMode)
    : "HYBRID"

  const apiEnabledNetworks = parseCsvNetworks(process.env.DISPATCH_API_NETWORKS || "MTN")

  return {
    mode,
    apiEnabledNetworks,
    providerKey: normalizeProviderChain(process.env.DISPATCH_PROVIDER_KEY),
    providerName: process.env.DISPATCH_PROVIDER_NAME || "Primary Provider",
    networkProviderMap: {},
  }
}

export async function getEffectiveDispatchPolicy(organizationId: string): Promise<DispatchPolicy> {
  const fallback = getDefaultDispatchPolicy()

  const record = await db.auditLog.findFirst({
    where: {
      organizationId,
      action: "DISPATCH_POLICY_SET",
      targetType: "SYSTEM_CONFIG",
      targetId: "dispatch-policy",
    },
    orderBy: { createdAt: "desc" },
    select: { meta: true },
  })

  if (!record?.meta) {
    return fallback
  }

  try {
    const parsed = JSON.parse(record.meta)
    const mode = VALID_MODES.includes(parsed?.mode) ? parsed.mode : fallback.mode

    const apiEnabledNetworks = Array.isArray(parsed?.apiEnabledNetworks)
      ? parsed.apiEnabledNetworks.map((n: string) => normalizeNetwork(n)).filter(Boolean)
      : fallback.apiEnabledNetworks

    const networkProviderMap =
      parsed?.networkProviderMap && typeof parsed.networkProviderMap === "object" && !Array.isArray(parsed.networkProviderMap)
        ? Object.entries(parsed.networkProviderMap as Record<string, unknown>).reduce<Record<string, string>>((acc, [network, providerKey]) => {
            if (typeof providerKey === "string" && providerKey.trim()) {
              acc[normalizeNetwork(network)] = normalizeProviderChain(providerKey)
            }
            return acc
          }, {})
        : fallback.networkProviderMap

    return {
      mode,
      apiEnabledNetworks,
      providerKey:
        typeof parsed?.providerKey === "string" && parsed.providerKey.trim().length > 0
          ? normalizeProviderChain(parsed.providerKey)
          : fallback.providerKey,
      providerName:
        typeof parsed?.providerName === "string" && parsed.providerName.trim().length > 0
          ? parsed.providerName.trim()
          : fallback.providerName,
      networkProviderMap,
    }
  } catch {
    return fallback
  }
}

export async function saveDispatchPolicy(input: SaveDispatchPolicyInput): Promise<DispatchPolicy> {
  const payload = {
    mode: input.mode,
    apiEnabledNetworks: input.apiEnabledNetworks.map((network) => normalizeNetwork(network)).filter(Boolean),
    providerKey: normalizeProviderChain(input.providerKey),
    providerName: input.providerName.trim() || "Primary Provider",
    networkProviderMap: Object.entries(input.networkProviderMap || {}).reduce<Record<string, string>>((acc, [network, providerKey]) => {
      const normalizedNetwork = normalizeNetwork(network)
      const normalizedProviderKey = normalizeProviderChain(providerKey)
      if (normalizedNetwork) acc[normalizedNetwork] = normalizedProviderKey
      return acc
    }, {}),
  }

  await db.auditLog.create({
    data: {
      actorId: input.actorId,
      actorName: input.actorName,
      action: "DISPATCH_POLICY_SET",
      targetType: "SYSTEM_CONFIG",
      targetId: "dispatch-policy",
      organizationId: input.organizationId,
      meta: JSON.stringify(payload),
    },
  })

  return payload
}

export function shouldUseProviderApi(policy: DispatchPolicy, network: string) {
  const normalized = normalizeNetwork(network)
  const enabled = policy.apiEnabledNetworks.includes(normalized)
  const providerKey = policy.networkProviderMap[normalized] || policy.providerKey || "primary"
  const providerKeys = parseProviderChain(providerKey)

  if (policy.mode === "MANUAL_ONLY") {
    return {
      useApi: false,
      reason: "Global mode is manual only",
      providerKey,
      providerKeys,
      providerName: policy.providerName,
    }
  }

  if (policy.mode === "API_ONLY") {
    if (policy.apiEnabledNetworks.length === 0 || enabled) {
      return {
        useApi: true,
        reason: "Global mode is API only",
        providerKey,
        providerKeys,
        providerName: policy.providerName,
      }
    }

    return {
      useApi: false,
      reason: `Network ${normalized} is not allowed for API in current policy`,
      providerKey,
      providerKeys,
      providerName: policy.providerName,
    }
  }

  // HYBRID mode
  if (enabled) {
    return {
      useApi: true,
      reason: `Network ${normalized} is enabled for API dispatch`,
      providerKey,
      providerKeys,
      providerName: policy.providerName,
    }
  }

  return {
    useApi: false,
    reason: `Network ${normalized} is routed to manual processing`,
    providerKey,
    providerKeys,
    providerName: policy.providerName,
  }
}
