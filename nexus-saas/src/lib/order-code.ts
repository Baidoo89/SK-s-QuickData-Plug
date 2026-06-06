import { db } from "@/lib/db"

type OrderCodeDb = Pick<typeof db, "$queryRaw">

type CounterRow = {
  nextValue: number
}

function formatDateKey(date = new Date()) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}${month}${day}`
}

export async function allocatePublicOrderCode(client: OrderCodeDb = db) {
  const dateKey = formatDateKey()
  const rows = await client.$queryRaw<CounterRow[]>`
    INSERT INTO "OrderNumberCounter" ("id", "dateKey", "nextValue", "createdAt", "updatedAt")
    VALUES (${`order-counter-${dateKey}`}, ${dateKey}, 1, NOW(), NOW())
    ON CONFLICT ("dateKey") DO UPDATE SET
      "nextValue" = "OrderNumberCounter"."nextValue" + 1,
      "updatedAt" = NOW()
    RETURNING "nextValue"
  `

  const nextValue = rows[0]?.nextValue ?? 1
  return `TD-${dateKey}-${String(nextValue).padStart(6, "0")}`
}

export function displayOrderCode(order: { id: string; publicOrderCode?: string | null }) {
  return order.publicOrderCode || order.id.slice(-8)
}
