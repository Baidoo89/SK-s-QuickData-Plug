import { db } from "@/lib/db"

type StorefrontPaymentRow = {
  id: string
  organizationId: string
  reference: string
  amount: number
  status: string
  orderIds: string
  paidAt: Date | null
}

export type OrderPaymentSummary = {
  reference: string
  status: string
  amount: number
  paidAt: Date | null
  owner: "STOREFRONT" | "WALLET" | "EXTERNAL"
}

function parseOrderIds(value: string) {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}

export async function getStorefrontPaymentMap(orderIds: string[], organizationId?: string | null) {
  if (orderIds.length === 0) {
    return new Map<string, OrderPaymentSummary>()
  }

  const rows = organizationId
    ? await db.$queryRaw<StorefrontPaymentRow[]>`
        SELECT "id", "organizationId", "reference", "amount", "status", "orderIds", "paidAt"
        FROM "StorefrontPayment"
        WHERE "organizationId" = ${organizationId}
        ORDER BY "createdAt" DESC
      `
    : await db.$queryRaw<StorefrontPaymentRow[]>`
        SELECT "id", "organizationId", "reference", "amount", "status", "orderIds", "paidAt"
        FROM "StorefrontPayment"
        ORDER BY "createdAt" DESC
        LIMIT 2000
      `

  const wanted = new Set(orderIds)
  const map = new Map<string, OrderPaymentSummary>()

  for (const row of rows) {
    for (const orderId of parseOrderIds(row.orderIds)) {
      if (!wanted.has(orderId) || map.has(orderId)) continue
      map.set(orderId, {
        reference: row.reference,
        status: row.status,
        amount: row.amount,
        paidAt: row.paidAt,
        owner: "STOREFRONT",
      })
    }
  }

  return map
}
