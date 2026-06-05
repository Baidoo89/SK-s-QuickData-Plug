import { db } from "@/lib/db"

type ApiOrderMeta = {
  source?: string
  apiKeyId?: string
  externalReference?: string | null
  callbackUrl?: string | null
  amountPaid?: number
  computedTotal?: number
  network?: string
}

function parseMeta(meta: string | null): ApiOrderMeta {
  if (!meta) return {}
  try {
    const parsed = JSON.parse(meta)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

export async function findApiOrderByExternalReference(params: {
  organizationId: string
  externalReference: string
}) {
  const directOrder = await db.order.findFirst({
    where: {
      organizationId: params.organizationId,
      source: "API",
      externalReference: params.externalReference,
    },
    include: {
      items: { include: { product: true }, take: 1 },
      customer: true,
    },
  })

  if (directOrder) return directOrder

  const logs = await db.auditLog.findMany({
    where: {
      action: "API_ORDER_CREATED",
      targetType: "ORDER",
      organizationId: params.organizationId,
      meta: { contains: params.externalReference },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { targetId: true, meta: true },
  })

  const match = logs.find((log) => parseMeta(log.meta).externalReference === params.externalReference)
  if (!match) return null

  return db.order.findFirst({
    where: {
      id: match.targetId,
      organizationId: params.organizationId,
    },
    include: {
      items: { include: { product: true }, take: 1 },
      customer: true,
    },
  })
}

export async function getApiOrderCreationMeta(orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { source: true, externalReference: true },
  })

  const log = await db.auditLog.findFirst({
    where: {
      action: "API_ORDER_CREATED",
      targetType: "ORDER",
      targetId: orderId,
    },
    orderBy: { createdAt: "desc" },
    select: { meta: true },
  })

  const meta = parseMeta(log?.meta ?? null)
  if (order?.source === "API") {
    return {
      ...meta,
      source: "API",
      externalReference: order.externalReference || meta.externalReference || null,
    }
  }

  return meta
}

export async function assertApiOrderRateLimit(params: {
  apiKeyId: string
  organizationId: string
}) {
  const limit = Number(process.env.API_ORDER_RATE_LIMIT_PER_MINUTE || "60")
  if (!Number.isFinite(limit) || limit <= 0) return { ok: true as const }

  const since = new Date(Date.now() - 60 * 1000)
  const count = await db.auditLog.count({
    where: {
      action: "API_ORDER_CREATED",
      targetType: "ORDER",
      organizationId: params.organizationId,
      actorId: params.apiKeyId,
      createdAt: { gte: since },
    },
  })

  if (count >= limit) {
    return { ok: false as const, limit }
  }

  return { ok: true as const }
}

export async function notifyApiOrderStatus(orderId: string, status: string) {
  const meta = await getApiOrderCreationMeta(orderId)
  const callbackUrl = typeof meta.callbackUrl === "string" ? meta.callbackUrl.trim() : ""

  if (!callbackUrl || !/^https?:\/\//i.test(callbackUrl)) {
    return { attempted: false as const }
  }

  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        organizationId: true,
        phoneNumber: true,
        total: true,
        status: true,
        updatedAt: true,
      },
    })

    if (!order) return { attempted: false as const }

    const response = await fetch(callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "order.status_changed",
        orderId,
        externalReference: meta.externalReference || null,
        status,
        phoneNumber: order.phoneNumber,
        total: order.total,
        updatedAt: order.updatedAt.toISOString(),
      }),
    })

    await db.auditLog.create({
      data: {
        action: "API_ORDER_CALLBACK_ATTEMPT",
        targetType: "ORDER",
        targetId: orderId,
        organizationId: order.organizationId,
        meta: JSON.stringify({
          callbackUrl,
          httpStatus: response.status,
          ok: response.ok,
        }),
      },
    })

    return { attempted: true as const, ok: response.ok }
  } catch (error) {
    await db.auditLog.create({
      data: {
        action: "API_ORDER_CALLBACK_ERROR",
        targetType: "ORDER",
        targetId: orderId,
        meta: JSON.stringify({
          callbackUrl,
          error: error instanceof Error ? error.message : "Unknown callback error",
        }),
      },
    })

    return { attempted: true as const, ok: false }
  }
}
