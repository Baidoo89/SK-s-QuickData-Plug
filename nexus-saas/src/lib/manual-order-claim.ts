import { randomUUID } from "node:crypto"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"

type ClaimActor = { id: string; email: string; role: string; organizationId: string | null }

// Only rows actually changed by this transaction belong in a claimed export.
// Lock in ID order so overlapping exports acquire their row locks consistently.
export async function claimManualOrders(orderIds: string[], actor: ClaimActor) {
  const superadmin = actor.role === "SUPERADMIN"
  if (!superadmin && (actor.role !== "SUBSCRIBER" || !actor.organizationId)) throw new Error("MANUAL_CLAIM_FORBIDDEN")
  const ids = [...new Set(orderIds)].sort().slice(0, 1000)
  if (!ids.length) return []
  const tenant = superadmin ? Prisma.empty : Prisma.sql`AND o."organizationId" = ${actor.organizationId}`
  return db.$transaction(async tx => {
    const claimed = await tx.$queryRaw<Array<{ id: string; organizationId: string | null }>>`
      WITH eligible AS (
        SELECT o."id" FROM "Order" o
        WHERE o."id" IN (${Prisma.join(ids)}) AND o."status" = 'PENDING'
          AND o."paymentStatus" = 'PAID' AND o."fulfillmentMode" = 'MANUAL' ${tenant}
        ORDER BY o."id" FOR UPDATE
      )
      UPDATE "Order" AS target SET "status" = 'PROCESSING', "updatedAt" = NOW()
      FROM eligible WHERE target."id" = eligible."id"
      RETURNING target."id", target."organizationId"
    `
    if (!claimed.length) return []
    await tx.auditLog.createMany({ data: claimed.map(order => ({ actorId: actor.id, actorName: actor.email, action: "ORDER_MANUAL_CLAIMED", targetType: "ORDER", targetId: order.id, organizationId: order.organizationId, meta: JSON.stringify({ previousStatus: "PENDING", status: "PROCESSING", exportType: "manual-queue" }) })) })
    await tx.auditLog.create({ data: { actorId: actor.id, actorName: actor.email, action: "ORDER_MANUAL_CLAIM_EXPORT", targetType: "SYSTEM", targetId: `manual-queue-${randomUUID()}`, organizationId: superadmin ? null : actor.organizationId, meta: JSON.stringify({ claimedCount: claimed.length }) } })
    return claimed.map(order => order.id)
  }, { maxWait: 10000, timeout: 20000 })
}
