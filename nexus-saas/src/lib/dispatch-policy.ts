import { db } from "@/lib/db"

export type DispatchMode = "MANUAL_ONLY" | "API_ONLY" | "HYBRID"

export type DispatchPolicy = {
  mode: DispatchMode
  apiEnabledNetworks: string[]
  providerName: string
}

const VALID_MODES: DispatchMode[] = ["MANUAL_ONLY", "API_ONLY", "HYBRID"]

function normalizeNetwork(value: string): string {
  return value.trim().toUpperCase()
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
    providerName: process.env.DISPATCH_PROVIDER_NAME || "Primary Provider",
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

    return {
      mode,
      apiEnabledNetworks,
      providerName:
        typeof parsed?.providerName === "string" && parsed.providerName.trim().length > 0
          ? parsed.providerName.trim()
          : fallback.providerName,
    }
  } catch {
    return fallback
  }
}

export function shouldUseProviderApi(policy: DispatchPolicy, network: string) {
  const normalized = normalizeNetwork(network)
  const enabled = policy.apiEnabledNetworks.includes(normalized)

  if (policy.mode === "MANUAL_ONLY") {
    return {
      useApi: false,
      reason: "Global mode is manual only",
      providerName: policy.providerName,
    }
  }

  if (policy.mode === "API_ONLY") {
    if (policy.apiEnabledNetworks.length === 0 || enabled) {
      return {
        useApi: true,
        reason: "Global mode is API only",
        providerName: policy.providerName,
      }
    }

    return {
      useApi: false,
      reason: `Network ${normalized} is not allowed for API in current policy`,
      providerName: policy.providerName,
    }
  }

  // HYBRID mode
  if (enabled) {
    return {
      useApi: true,
      reason: `Network ${normalized} is enabled for API dispatch`,
      providerName: policy.providerName,
    }
  }

  return {
    useApi: false,
    reason: `Network ${normalized} is routed to manual processing`,
    providerName: policy.providerName,
  }
}
