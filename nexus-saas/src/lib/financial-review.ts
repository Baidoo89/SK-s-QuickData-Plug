import { createHash, randomUUID } from "node:crypto"
import { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { moneyToMinor, minorToMoney } from "@/lib/money"

export type ReviewActor = { id: string; email: string; role: string; organizationId: string | null }
export type ReviewKind = "DISPATCH_UNCERTAIN" | "STOREFRONT_PAYMENT" | "SUBSCRIPTION_PAYMENT" | "PROVIDER_CONFLICT"
type Signal = { kind: ReviewKind; organizationId: string | null; targetType: string; targetId: string; reference?: string | null; reason: string }
const actions: Record<ReviewKind, string> = { DISPATCH_UNCERTAIN: "STOREFRONT_DISPATCH_NEEDS_REVIEW", STOREFRONT_PAYMENT: "STOREFRONT_PAYMENT_NEEDS_REVIEW", SUBSCRIPTION_PAYMENT: "SUBSCRIPTION_PAYMENT_NEEDS_REVIEW", PROVIDER_CONFLICT: "PROVIDER_STATUS_CONFLICT" }
function key(input: Signal) { return createHash("sha256").update(JSON.stringify([input.kind, input.targetType, input.targetId, input.reference ?? ""])).digest("hex") }
function scope(actor: ReviewActor): Prisma.FinancialReviewCaseWhereInput {
  if (actor.role === "SUPERADMIN") return {}
  if (actor.role === "SUBSCRIBER" && actor.organizationId) return { organizationId: actor.organizationId }
  throw new Error("REVIEW_FORBIDDEN")
}
export async function recordFinancialReviewInTransaction(tx: Prisma.TransactionClient, input: Signal) {
  const audit = await tx.auditLog.create({ data: { action: actions[input.kind], targetType: input.targetType, targetId: input.targetId, organizationId: input.organizationId, meta: JSON.stringify({ reference: input.reference ?? null, reason: input.reason }) } })
  const data = { organizationId: input.organizationId, kind: input.kind, targetType: input.targetType, targetId: input.targetId, reference: input.reference ?? null, reason: input.reason, sourceAuditId: audit.id }
  return tx.financialReviewCase.upsert({ where: { caseKey: key(input) }, create: { caseKey: key(input), ...data }, update: { ...data, status: "OPEN", version: { increment: 1 }, reviewNote: null, reviewedByUserId: null, reviewedByName: null, reviewedAt: null } })
}
export async function recordFinancialReview(input: Signal) {
  return db.$transaction(tx => recordFinancialReviewInTransaction(tx, input), { maxWait: 10000, timeout: 20000 })
}

// Import interrupted claims and older dispatch alerts in bounded batches. A
// recorded review is not reopened merely because the same old claim is scanned.
export async function syncInterruptedDispatches(actor: ReviewActor) {
  scope(actor)
  const tenant = actor.role === "SUPERADMIN" ? Prisma.empty : Prisma.sql`AND o."organizationId" = ${actor.organizationId}`
  const rows = await db.$queryRaw<Array<{ id: string; targetId: string; organizationId: string; meta: string | null }>>`
    SELECT DISTINCT ON (a."targetId") a."id", a."targetId", o."organizationId", a."meta"
    FROM "AuditLog" a JOIN "Order" o ON o."id" = a."targetId"
    WHERE a."targetType" = 'ORDER' AND a."action" IN ('STOREFRONT_DISPATCH_STARTED','STOREFRONT_DISPATCH_NEEDS_REVIEW')
      AND o."status" IN ('PENDING','PROCESSING') AND o."paymentStatus" = 'PAID' ${tenant}
      AND (a."action" = 'STOREFRONT_DISPATCH_NEEDS_REVIEW' OR a."createdAt" < NOW() - INTERVAL '5 minutes')
      AND NOT EXISTS (SELECT 1 FROM "AuditLog" h WHERE h."targetType" = 'ORDER' AND h."targetId" = a."targetId" AND h."action" = 'STOREFRONT_DISPATCH_HANDLED' AND h."createdAt" >= a."createdAt")
      AND NOT EXISTS (SELECT 1 FROM "FinancialReviewCase" c WHERE c."kind" = 'DISPATCH_UNCERTAIN' AND c."targetType" = 'ORDER' AND c."targetId" = a."targetId")
    ORDER BY a."targetId", a."createdAt" DESC, a."id" DESC LIMIT 100
  `
  let imported = 0
  for (const row of rows) {
    let reference: string | null = null
    try { const value = JSON.parse(row.meta ?? "{}").reference; if (typeof value === "string") reference = value } catch { /* Legacy malformed metadata does not expose arbitrary data. */ }
    const signal: Signal = { kind: "DISPATCH_UNCERTAIN", organizationId: row.organizationId, targetType: "ORDER", targetId: row.targetId, reference, reason: "Dispatch has no confirmed completion. Check the provider before retrying." }
    imported += await db.$transaction(async tx => {
      const id = randomUUID()
      const inserted = await tx.financialReviewCase.createMany({ data: [{ id, caseKey: key(signal), organizationId: signal.organizationId, kind: signal.kind, targetType: signal.targetType, targetId: signal.targetId, reference, reason: signal.reason, sourceAuditId: row.id }], skipDuplicates: true })
      if (inserted.count) await tx.auditLog.create({ data: { action: "FINANCIAL_REVIEW_OPENED", targetType: "FINANCIAL_REVIEW_CASE", targetId: id, organizationId: signal.organizationId, meta: JSON.stringify({ sourceAuditId: row.id, reason: "interrupted_dispatch_import" }) } })
      return inserted.count
    })
  }
  return imported
}

async function overdueAccounts(actor: ReviewActor, query: string) {
  const tenant = actor.role === "SUPERADMIN" ? Prisma.empty : Prisma.sql`AND c."organizationId" = ${actor.organizationId} AND (u."id" = ${actor.id} OR u."role" IN ('AGENT','RESELLER'))`
  const search = query ? Prisma.sql`AND (u."email" ILIKE ${"%" + query + "%"} OR u."name" ILIKE ${"%" + query + "%"})` : Prisma.empty
  const rows = await db.$queryRaw<Array<{ userId: string; email: string | null; name: string | null; dueAt: Date; balance: string }>>`
    SELECT u."id" AS "userId", u."email", u."name", c."dueAt", COALESCE(SUM(w."amount"::numeric),0)::text AS balance
    FROM "CreditAccount" c JOIN "User" u ON u."id" = c."userId"
    LEFT JOIN "WalletTransaction" w ON w."userId" = u."id" AND w."status" = 'success'
    WHERE c."dueAt" <= NOW() ${tenant} ${search}
    GROUP BY u."id", c."userId" HAVING COALESCE(SUM(w."amount"::numeric),0) < 0
    ORDER BY c."dueAt", u."id" LIMIT 26
  `
  return { rows: rows.slice(0, 25).map(row => ({ userId: row.userId, email: row.email, name: row.name, dueAt: row.dueAt.toISOString(), owed: minorToMoney(-moneyToMinor(row.balance)) })), hasMore: rows.length > 25 }
}

export async function listFinancialReviews(actor: ReviewActor, input: { status: "OPEN" | "REVIEWED" | "ALL"; page: number; query: string }) {
  const access = scope(actor)
  const imported = await syncInterruptedDispatches(actor)
  const search: Prisma.FinancialReviewCaseWhereInput = input.query ? { OR: [{ targetId: { contains: input.query, mode: "insensitive" } }, { reference: { contains: input.query, mode: "insensitive" } }, { reason: { contains: input.query, mode: "insensitive" } }] } : {}
  if (input.query) {
    const order = await db.order.findFirst({ where: { ...(actor.role === "SUPERADMIN" ? {} : { organizationId: actor.organizationId! }), publicOrderCode: { equals: input.query, mode: "insensitive" } }, select: { id: true } })
    if (order) search.OR!.push({ targetType: "ORDER", targetId: order.id })
  }
  const filtered = { AND: [access, search] }
  const where = { AND: [filtered, ...(input.status === "ALL" ? [] : [{ status: input.status }])] }
  const [cases, total, openCount, reviewedCount, overdue] = await Promise.all([
    db.financialReviewCase.findMany({ where, include: { organization: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: input.page * 25, take: 25 }),
    db.financialReviewCase.count({ where }),
    db.financialReviewCase.count({ where: { AND: [filtered, { status: "OPEN" }] } }),
    db.financialReviewCase.count({ where: { AND: [filtered, { status: "REVIEWED" }] } }),
    overdueAccounts(actor, input.query),
  ])
  const orders = await db.order.findMany({ where: { id: { in: cases.filter(row => row.targetType === "ORDER").map(row => row.targetId) }, ...(actor.role === "SUPERADMIN" ? {} : { organizationId: actor.organizationId! }) }, select: { id: true, publicOrderCode: true, status: true } })
  const orderMap = new Map(orders.map(order => [order.id, order]))
  return { cases: cases.map(row => ({ id: row.id, kind: row.kind, targetType: row.targetType, targetId: row.targetId, reference: row.reference, reason: row.reason, status: row.status, version: row.version, organization: row.organization?.name ?? "Platform", createdAt: row.createdAt.toISOString(), reviewNote: row.reviewNote, reviewedAt: row.reviewedAt?.toISOString() ?? null, reviewedBy: row.reviewedByName, orderCode: orderMap.get(row.targetId)?.publicOrderCode ?? row.targetId, orderStatus: orderMap.get(row.targetId)?.status ?? null })), total, openCount, reviewedCount, page: input.page, pageSize: 25, overdue, imported, isPlatformAdmin: actor.role === "SUPERADMIN" }
}
export async function reviewFinancialCase(actor: ReviewActor, input: { id: string; version: number; status: "OPEN" | "REVIEWED"; note: string }) {
  const access = scope(actor)
  const note = input.note.trim()
  if (note.length < 10 || note.length > 1000 || !Number.isSafeInteger(input.version) || input.version < 1 || !["OPEN", "REVIEWED"].includes(input.status)) throw new Error("INVALID_REVIEW")
  return db.$transaction(async tx => {
    const existing = await tx.financialReviewCase.findFirst({ where: { AND: [access, { id: input.id }] } })
    if (!existing) throw new Error("REVIEW_NOT_FOUND")
    const updated = await tx.financialReviewCase.updateMany({ where: { id: existing.id, version: input.version }, data: { status: input.status, version: { increment: 1 }, reviewNote: note, reviewedByUserId: actor.id, reviewedByName: actor.email, reviewedAt: new Date() } })
    if (!updated.count) throw new Error("REVIEW_CONFLICT")
    await tx.auditLog.create({ data: { action: "FINANCIAL_REVIEW_RECORDED", targetType: "FINANCIAL_REVIEW_CASE", targetId: existing.id, organizationId: existing.organizationId, actorId: actor.id, actorName: actor.email, meta: JSON.stringify({ from: existing.status, to: input.status, sourceAuditId: existing.sourceAuditId, note }) } })
    return { id: existing.id, status: input.status, version: input.version + 1 }
  }, { maxWait: 10000, timeout: 20000 })
}
