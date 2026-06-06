import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { db } from "@/lib/db"
import { getDispatchProviderConnection } from "@/lib/provider-connection"
import { applyProviderStatusUpdate, normalizeProviderOrderStatus } from "@/lib/provider-status"

export const dynamic = "force-dynamic"

type DispatchAttemptMeta = {
  providerKey?: string
  templateKey?: string
  externalRef?: string | null
  accepted?: boolean
}

function parseMeta(meta: string | null): DispatchAttemptMeta {
  if (!meta) return {}
  try {
    const parsed = JSON.parse(meta)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function isAuthorized(req: Request) {
  const url = new URL(req.url)
  const configuredSecret = process.env.PROVIDER_SYNC_SECRET?.trim() || process.env.PROVIDER_WEBHOOK_SECRET?.trim()
  if (!configuredSecret) return false

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
  const headerSecret = req.headers.get("x-provider-secret")?.trim()
  const querySecret = url.searchParams.get("secret")?.trim()

  return bearer === configuredSecret || headerSecret === configuredSecret || querySecret === configuredSecret
}

function buildSkPlugStatusUrl(providerOrderUrl: string, externalRef: string) {
  const url = new URL(providerOrderUrl)
  const encodedRef = encodeURIComponent(externalRef)

  if (/\/order\/?$/i.test(url.pathname)) {
    url.pathname = url.pathname.replace(/\/order\/?$/i, `/status/${encodedRef}/`)
    return url.toString()
  }

  const normalizedPath = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`
  url.pathname = `${normalizedPath}status/${encodedRef}/`.replace(/\/{2,}/g, "/")
  return url.toString()
}

async function syncProviderStatuses(req: Request) {
  if (!isAuthorized(req)) {
    return ApiErrors.FORBIDDEN()
  }

  const url = new URL(req.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || "50"), 1), 100)
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000)

  const attemptLogs = await db.auditLog.findMany({
    where: {
      action: "ORDER_DISPATCH_ATTEMPT",
      createdAt: { gte: since },
      meta: { contains: '"templateKey":"skplug"' },
    },
    orderBy: { createdAt: "desc" },
    take: limit * 3,
    select: {
      targetId: true,
      organizationId: true,
      meta: true,
    },
  })

  const candidates = new Map<string, { orderId: string; organizationId: string; providerKey: string; externalRef: string }>()
  for (const log of attemptLogs) {
    if (candidates.size >= limit) break
    const meta = parseMeta(log.meta)
    if (!meta.accepted || !meta.externalRef || candidates.has(log.targetId)) continue
    candidates.set(log.targetId, {
      orderId: log.targetId,
      organizationId: log.organizationId || "",
      providerKey: meta.providerKey || "primary",
      externalRef: meta.externalRef,
    })
  }

  const orderIds = Array.from(candidates.keys())
  const pendingOrders = orderIds.length
    ? await db.order.findMany({
        where: {
          id: { in: orderIds },
          fulfillmentMode: "API",
          status: { in: ["PENDING", "PROCESSING"] },
        },
        select: { id: true },
      })
    : []

  const pendingOrderIds = new Set(pendingOrders.map((order) => order.id))
  const results: Array<{ orderId: string; externalRef: string; status?: string; updated?: boolean; error?: string }> = []

  for (const candidate of candidates.values()) {
    if (!pendingOrderIds.has(candidate.orderId) || !candidate.organizationId) continue

    try {
      const connection = await getDispatchProviderConnection(candidate.organizationId, candidate.providerKey)
      if (!connection?.providerOrderUrl || !connection.providerApiKey) {
        results.push({ orderId: candidate.orderId, externalRef: candidate.externalRef, error: "Provider connection is missing URL or API key" })
        continue
      }

      const response = await fetch(buildSkPlugStatusUrl(connection.providerOrderUrl, candidate.externalRef), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${connection.providerApiKey}`,
          Accept: "application/json",
        },
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        results.push({ orderId: candidate.orderId, externalRef: candidate.externalRef, error: `Status check failed with HTTP ${response.status}` })
        continue
      }

      const status = normalizeProviderOrderStatus(payload?.status)
      const updated = await applyProviderStatusUpdate({
        orderId: candidate.orderId,
        status,
        externalRef: candidate.externalRef,
        message: payload?.message || null,
        source: "poll",
      })

      results.push({ orderId: candidate.orderId, externalRef: candidate.externalRef, status: updated?.status || status, updated: Boolean(updated) })
    } catch (error) {
      results.push({
        orderId: candidate.orderId,
        externalRef: candidate.externalRef,
        error: error instanceof Error ? error.message : "Unknown status sync error",
      })
    }
  }

  return apiSuccess({
    checked: results.length,
    updated: results.filter((result) => result.updated).length,
    results,
  })
}

export async function GET(req: Request) {
  try {
    return await syncProviderStatuses(req)
  } catch (error) {
    logApiError("[PROVIDER_SYNC_GET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}

export async function POST(req: Request) {
  try {
    return await syncProviderStatuses(req)
  } catch (error) {
    logApiError("[PROVIDER_SYNC_POST]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
