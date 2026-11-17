import { randomBytes } from "node:crypto"
import { afterAll, beforeAll, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ email: "" }))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { email: session.email } }) }))
vi.mock("@/lib/mail", () => ({ getBaseUrl: () => "http://127.0.0.1:3017", sendSignupNotificationEmail: vi.fn() }))
import { GET as ownerTimeline } from "@/app/api/orders/[id]/timeline/route"
import { db } from "@/lib/db"
import { DELETE as deleteAgent, PUT as updateAgent } from "@/app/api/agents/[id]/route"
import { DELETE as deleteReseller, PUT as updateReseller } from "@/app/api/resellers/[id]/route"
import { databaseUrl, readLocalConfig } from "../../scripts/local-environment.mjs"
const runId = `qd_history_${randomBytes(6).toString("hex")}`
let verified = false
let ownerEmail: string
const context = (id: string) => ({ params: Promise.resolve({ id }) })
async function agent() {
  const record = await db.agent.create({ data: { name: "History fixture", organizationId: runId } })
  const user = await db.user.create({ data: { email: `${randomBytes(8).toString("hex")}@history.test`, role: "AGENT", organizationId: runId, agentId: record.id } })
  return { record, user }
}
beforeAll(async () => {
  const value = process.env.QUICKDATA_TEST_DATABASE_URL
  if (process.env.QUICKDATA_DATABASE_INTEGRATION !== "1" || value !== process.env.DATABASE_URL || value !== databaseUrl(readLocalConfig(), "quickdata_integration")) throw new Error("Use isolated database")
  verified = true
  await db.organization.create({ data: { id: runId, name: runId, slug: runId } })
  ownerEmail = `${runId}@history.test`
  await db.user.create({ data: { email: ownerEmail, role: "SUBSCRIBER", organizationId: runId } })
})
it("rejects deletion of an agent with debt and allows deactivation without losing the ledger", async () => {
  const f = await agent()
  await db.walletTransaction.create({ data: { userId: f.user.id, amount: -10, method: "manual" } })
  session.email = ownerEmail
  const response = await deleteAgent(new Request("http://localhost/api/agents", { method: "DELETE" }), context(f.record.id))
  expect(response.status).toBe(400)
  expect(await db.agent.findUnique({ where: { id: f.record.id } })).not.toBeNull()
  const disabled = await updateAgent(new Request("http://localhost/api/agents", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: f.record.name, active: false }) }), context(f.record.id))
  expect(disabled.status).toBe(200)
  expect((await db.user.findUniqueOrThrow({ where: { id: f.user.id } })).active).toBe(false)
  expect((await db.walletTransaction.aggregate({ where: { userId: f.user.id }, _sum: { amount: true } }))._sum.amount).toBe(-10)
})
it("retains agent ownership on historical orders", async () => {
  const f = await agent()
  const order = await db.order.create({ data: { organizationId: runId, agentId: f.record.id, total: 5, status: "COMPLETED" } })
  session.email = ownerEmail
  expect((await deleteAgent(new Request("http://localhost/api/agents", { method: "DELETE" }), context(f.record.id))).status).toBe(400)
  expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).agentId).toBe(f.record.id)
})
it("reseller financial history is retained instead of returning a foreign-key error", async () => {
  const f = await agent()
  const reseller = await db.user.create({ data: { email: `${randomBytes(8).toString("hex")}@history.test`, organizationId: runId, role: "RESELLER", parentAgentId: f.record.id } })
  await db.walletTransaction.create({ data: { userId: reseller.id, amount: 10, method: "manual" } })
  session.email = f.user.email!
  const response = await deleteReseller(new Request("http://localhost/api/resellers", { method: "DELETE" }), context(reseller.id))
  expect(response.status).toBe(400)
  expect(await db.user.findUnique({ where: { id: reseller.id } })).not.toBeNull()
})
it("an unused agent without linked history can still be removed", async () => {
  const f = await agent()
  session.email = ownerEmail
  expect((await deleteAgent(new Request("http://localhost/api/agents", { method: "DELETE" }), context(f.record.id))).status).toBe(204)
  expect(await db.agent.findUnique({ where: { id: f.record.id } })).toBeNull()
})

it("agents cannot read another owner's full order timeline through the manager endpoint", async () => {
  const f = await agent()
  const order = await db.order.create({ data: { organizationId: runId, total: 5 } })
  session.email = f.user.email!
  expect((await ownerTimeline(new Request("http://localhost/api/orders/timeline"), context(order.id))).status).toBe(403)
})


it("rolls back agent deactivation when its audit cannot be written", async () => {
  const f = await agent()
  session.email = ownerEmail
  const fn = runId + "_status_fail"; const trigger = runId + "_status_trigger"
  await db.$executeRawUnsafe(`CREATE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN IF NEW."targetId" = '${f.record.id}' AND NEW."action" = 'ACCOUNT_STATUS_CHANGED' THEN RAISE EXCEPTION 'Deliberate account status audit failure'; END IF; RETURN NEW; END $body$`)
  await db.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${fn}"()`)
  const log = vi.spyOn(console, "error").mockImplementation(() => {})
  try {
    const response = await updateAgent(new Request("http://localhost/api/agents", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: f.record.name, active: false }) }), context(f.record.id))
    expect(response.status).toBe(500)
    expect((await db.agent.findUniqueOrThrow({ where: { id: f.record.id } })).active).toBe(true)
    expect((await db.user.findUniqueOrThrow({ where: { id: f.user.id } })).active).toBe(true)
  } finally {
    log.mockRestore()
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "AuditLog"`)
    await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`)
  }
})
it("reseller deactivation is audited and retains the wallet record", async () => {
  const f = await agent()
  const reseller = await db.user.create({ data: { email: `${randomBytes(8).toString("hex")}@history.test`, organizationId: runId, role: "RESELLER", parentAgentId: f.record.id } })
  await db.walletTransaction.create({ data: { userId: reseller.id, amount: -5, method: "manual" } })
  session.email = f.user.email!
  const response = await updateReseller(new Request("http://localhost/api/resellers", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: false }) }), context(reseller.id))
  expect(response.status).toBe(200)
  expect((await db.user.findUniqueOrThrow({ where: { id: reseller.id } })).active).toBe(false)
  expect(await db.auditLog.count({ where: { action: "ACCOUNT_STATUS_CHANGED", targetId: reseller.id } })).toBe(1)
  expect(await db.walletTransaction.count({ where: { userId: reseller.id } })).toBe(1)
})

afterAll(async () => {
  if (!verified) return
  try {
    await db.financialReviewCase.deleteMany({ where: { organizationId: runId } })
    await db.auditLog.deleteMany({ where: { organizationId: runId } })
    await db.order.deleteMany({ where: { organizationId: runId } })
    await db.walletTransaction.deleteMany({ where: { user: { organizationId: runId } } })
    await db.user.deleteMany({ where: { organizationId: runId } })
    await db.agent.deleteMany({ where: { organizationId: runId } })
    await db.organization.delete({ where: { id: runId } })
  } finally { await db.$disconnect() }
})
