import { randomBytes } from "node:crypto"
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ email: "" }))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { email: session.email } }) }))
import { db } from "@/lib/db"
import { recordFinancialReview, reviewFinancialCase, listFinancialReviews, syncInterruptedDispatches } from "@/lib/financial-review"
import { GET, POST } from "@/app/api/reconciliation/route"
import { createOrderWalletDebit } from "@/lib/order-wallet"
import { applyProviderStatusUpdate } from "@/lib/provider-status"
import { databaseUrl, readLocalConfig } from "../../scripts/local-environment.mjs"
const runId = `qd_review_${randomBytes(6).toString("hex")}`
const orgA = runId + "_a"; const orgB = runId + "_b"
let verified = false
let owner: { id: string; email: string; role: string; organizationId: string }
let admin: typeof owner
let agent: typeof owner
const filter = { status: "ALL" as const, page: 0, query: "" }
async function order(organizationId = orgA, status = "PENDING") { return db.order.create({ data: { organizationId, total: 5, status, paymentStatus: "PAID", paymentOwner: "STOREFRONT" } }) }
async function signal(organizationId = orgA, reference = "review-ref") {
  const row = await order(organizationId)
  return { row, review: await recordFinancialReview({ kind: "DISPATCH_UNCERTAIN", organizationId, targetType: "ORDER", targetId: row.id, reference, reason: "Fixture dispatch needs provider confirmation." }) }
}
beforeAll(async () => {
  const value = process.env.QUICKDATA_TEST_DATABASE_URL
  if (process.env.QUICKDATA_DATABASE_INTEGRATION !== "1" || value !== process.env.DATABASE_URL || value !== databaseUrl(readLocalConfig(), "quickdata_integration")) throw new Error("Use isolated database")
  verified = true
  await db.organization.createMany({ data: [{ id: orgA, name: orgA, slug: orgA }, { id: orgB, name: orgB, slug: orgB }] })
  const actor = async (role: string) => { const user = await db.user.create({ data: { role, organizationId: orgA, email: `${randomBytes(8).toString("hex")}@review.test` } }); return { id: user.id, email: user.email!, role, organizationId: orgA } }
  owner = await actor("SUBSCRIBER"); admin = await actor("SUPERADMIN"); agent = await actor("AGENT")
})
beforeEach(async () => {
  session.email = owner.email
  await db.financialReviewCase.deleteMany({ where: { OR: [{ organizationId: { in: [orgA, orgB] } }, { targetId: { startsWith: runId } }] } })
  await db.auditLog.deleteMany({ where: { OR: [{ organizationId: { in: [orgA, orgB] } }, { targetId: { startsWith: runId } }] } })
  await db.creditAccount.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } })
  await db.walletTransaction.deleteMany({ where: { user: { organizationId: { in: [orgA, orgB] } } } })
  await db.order.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } })
})
it("owners see only their business; unassigned platform payments are admin-only", async () => {
  const own = await signal()
  const foreign = await signal(orgB)
  const global = await recordFinancialReview({ kind: "SUBSCRIPTION_PAYMENT", organizationId: null, targetType: "PAYMENT_REFERENCE", targetId: runId + "_global", reference: runId + "_unknown", reason: "Successful platform payment lacks a quote." })
  expect((await listFinancialReviews(owner, filter)).cases.map(row => row.id)).toEqual([own.review.id])
  const all = (await listFinancialReviews(admin, filter)).cases.map(row => row.id)
  expect(all).toEqual(expect.arrayContaining([own.review.id, foreign.review.id, global.id]))
  await expect(reviewFinancialCase(owner, { id: foreign.review.id, version: 1, status: "REVIEWED", note: "Foreign review must be denied" })).rejects.toThrow("REVIEW_NOT_FOUND")
})
it("agents cannot read or change the manager review queue", async () => {
  const f = await signal()
  session.email = agent.email
  expect((await GET(new Request("http://localhost/api/reconciliation"))).status).toBe(403)
  expect((await POST(new Request("http://localhost/api/reconciliation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: f.review.id, version: 1, status: "REVIEWED", note: "Not permitted for this role" }) }))).status).toBe(403)
})
it("repeated signals keep one case and a newer signal reopens the reviewed case", async () => {
  const f = await signal()
  await reviewFinancialCase(owner, { id: f.review.id, version: 1, status: "REVIEWED", note: "Provider checked; outcome recorded separately." })
  const latest = await recordFinancialReview({ kind: "DISPATCH_UNCERTAIN", organizationId: orgA, targetType: "ORDER", targetId: f.row.id, reference: "review-ref", reason: "New provider evidence requires another review." })
  expect(latest.id).toBe(f.review.id)
  expect(latest.status).toBe("OPEN")
  expect(latest.version).toBe(3)
  expect(await db.financialReviewCase.count({ where: { targetId: f.row.id } })).toBe(1)
  await expect(reviewFinancialCase(owner, { id: f.review.id, version: 2, status: "REVIEWED", note: "Stale review must not replace evidence." })).rejects.toThrow("REVIEW_CONFLICT")
})
it("recording a review changes neither order state nor wallet/debt balances", async () => {
  const f = await signal()
  await db.walletTransaction.create({ data: { userId: agent.id, amount: -10, method: "manual" } })
  const result = await reviewFinancialCase(owner, { id: f.review.id, version: 1, status: "REVIEWED", note: "Provider checked; staff must apply any verified outcome separately." })
  expect(result.status).toBe("REVIEWED")
  expect((await db.order.findUniqueOrThrow({ where: { id: f.row.id } })).status).toBe("PENDING")
  expect((await db.walletTransaction.aggregate({ where: { userId: agent.id }, _sum: { amount: true } }))._sum.amount).toBe(-10)
  expect(await db.auditLog.count({ where: { action: "FINANCIAL_REVIEW_RECORDED", targetId: f.review.id } })).toBe(1)
})
it("rolls back a review if its audit insert fails", async () => {
  const f = await signal()
  const fn = runId + "_fail_review"; const trigger = runId + "_review_trigger"
  await db.$executeRawUnsafe(`CREATE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN IF NEW."targetId" = '${f.review.id}' AND NEW."action" = 'FINANCIAL_REVIEW_RECORDED' THEN RAISE EXCEPTION 'Deliberate review failure'; END IF; RETURN NEW; END $body$`)
  await db.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${fn}"()`)
  try {
    await expect(reviewFinancialCase(owner, { id: f.review.id, version: 1, status: "REVIEWED", note: "This review must roll back with the audit failure." })).rejects.toThrow()
    expect((await db.financialReviewCase.findUniqueOrThrow({ where: { id: f.review.id } })).status).toBe("OPEN")
    expect((await db.financialReviewCase.findUniqueOrThrow({ where: { id: f.review.id } })).version).toBe(1)
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "AuditLog"`)
    await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`)
  }
})
it("imports an interrupted dispatch once and does not resurrect its old reviewed signal", async () => {
  const row = await order()
  await db.auditLog.create({ data: { action: "STOREFRONT_DISPATCH_STARTED", targetType: "ORDER", targetId: row.id, organizationId: orgA, createdAt: new Date(Date.now() - 600000), meta: JSON.stringify({ reference: "interrupted" }) } })
  expect(await syncInterruptedDispatches(owner)).toBe(1)
  expect(await syncInterruptedDispatches(owner)).toBe(0)
  const review = await db.financialReviewCase.findFirstOrThrow({ where: { targetId: row.id } })
  await reviewFinancialCase(owner, { id: review.id, version: 1, status: "REVIEWED", note: "Checked provider and recorded the outcome." })
  expect(await syncInterruptedDispatches(owner)).toBe(0)
  expect((await db.financialReviewCase.findUniqueOrThrow({ where: { id: review.id } })).status).toBe("REVIEWED")
})
it("does not import a confirmed handled dispatch", async () => {
  const row = await order()
  await db.auditLog.create({ data: { action: "STOREFRONT_DISPATCH_STARTED", targetType: "ORDER", targetId: row.id, organizationId: orgA, createdAt: new Date(Date.now() - 600000) } })
  await db.auditLog.create({ data: { action: "STOREFRONT_DISPATCH_HANDLED", targetType: "ORDER", targetId: row.id, organizationId: orgA } })
  expect(await syncInterruptedDispatches(owner)).toBe(0)
})
it("overdue debt stays visible until the actual ledger is repaid, including disabled credit", async () => {
  await db.creditAccount.create({ data: { userId: agent.id, organizationId: orgA, enabled: false, limitMinor: BigInt(5000), dueAt: new Date(Date.now() - 60000), approvedByUserId: owner.id, note: "Fixture loan" } })
  await db.walletTransaction.create({ data: { userId: agent.id, amount: -10, method: "manual" } })
  expect((await listFinancialReviews(owner, filter)).overdue.rows).toEqual(expect.arrayContaining([expect.objectContaining({ userId: agent.id, owed: 10 })]))
  await db.walletTransaction.create({ data: { userId: agent.id, amount: 10, method: "manual" } })
  expect((await listFinancialReviews(owner, filter)).overdue.rows).toEqual([])
})
it("provider conflicts create a case without changing a completed order", async () => {
  const row = await order(orgA, "COMPLETED")
  await applyProviderStatusUpdate({ orderId: row.id, status: "FAILED", source: "callback" })
  expect((await db.order.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("COMPLETED")
  expect(await db.financialReviewCase.count({ where: { targetId: row.id, kind: "PROVIDER_CONFLICT" } })).toBe(1)
})
it("wallet spending rechecks deactivation under the transaction lock", async () => {
  await db.walletTransaction.create({ data: { userId: agent.id, amount: 10, method: "manual" } })
  const row = await db.order.create({ data: { organizationId: orgA, userId: agent.id, total: 5 } })
  await db.user.update({ where: { id: agent.id }, data: { active: false } })
  try {
    await expect(createOrderWalletDebit({ orderId: row.id, organizationId: orgA, userId: agent.id, amount: 5 })).rejects.toThrow("WALLET_ACCOUNT_RESTRICTED")
    expect(await db.walletTransaction.count({ where: { userId: agent.id } })).toBe(1)
  } finally { await db.user.update({ where: { id: agent.id }, data: { active: true } }) }
})

it("rejects an empty review without changing the case", async () => {
  const f = await signal()
  const response = await POST(new Request("http://localhost/api/reconciliation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: f.review.id, version: 1, status: "REVIEWED", note: "short" }) }))
  expect(response.status).toBe(400)
  expect((await db.financialReviewCase.findUniqueOrThrow({ where: { id: f.review.id } })).version).toBe(1)
})

afterAll(async () => {
  if (!verified) return
  try {
    await db.financialReviewCase.deleteMany({ where: { OR: [{ organizationId: { in: [orgA, orgB] } }, { targetId: { startsWith: runId } }] } })
    await db.auditLog.deleteMany({ where: { OR: [{ organizationId: { in: [orgA, orgB] } }, { targetId: { startsWith: runId } }] } })
    await db.creditAccount.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } })
    await db.walletTransaction.deleteMany({ where: { user: { organizationId: { in: [orgA, orgB] } } } })
    await db.order.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } })
    await db.user.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } })
    await db.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } })
  } finally { await db.$disconnect() }
})

