import { randomBytes } from "node:crypto"
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"
const provider = vi.hoisted(() => ({ dispatch: vi.fn(async () => ({ finalStatus: "PENDING", dispatchMode: "MANUAL", dispatchProvider: "Fixture", dispatchReason: "Test" })) }))
vi.mock("@/lib/order-dispatch", () => ({ resolveOrderDispatch: provider.dispatch }))
import { db } from "@/lib/db"
import { POST, GET } from "@/app/api/v1/orders/route"
import { authenticateApiKey } from "@/lib/api-key-auth"
import { databaseUrl, readLocalConfig } from "../../scripts/local-environment.mjs"
const runId = `qd_api_${randomBytes(6).toString("hex")}`
let verified = false
let productId: string
let key: { id: string; key: string }
let secondKey: { id: string; key: string }
function post(reference: string, patch: Record<string, unknown> = {}, token = key.key) {
  return new Request("http://localhost/api/v1/orders", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ productId, phoneNumber: "0241234567", externalReference: reference, ...patch }) })
}
function get(orderId: string, token = key.key) { return new Request(`http://localhost/api/v1/orders?orderId=${orderId}`, { headers: { Authorization: `Bearer ${token}` } }) }
beforeAll(async () => {
  const value = process.env.QUICKDATA_TEST_DATABASE_URL
  if (process.env.QUICKDATA_DATABASE_INTEGRATION !== "1" || value !== process.env.DATABASE_URL || value !== databaseUrl(readLocalConfig(), "quickdata_integration")) throw new Error("Use isolated database")
  verified = true
  await db.organization.create({ data: { id: runId, name: runId, slug: runId } })
  const plan = await db.plan.create({ data: { name: runId, priceGHS: 0, features: "[]", maxProducts: 100, maxAgents: 10 } })
  await db.subscription.create({ data: { organizationId: runId, planId: plan.id, status: "ACTIVE" } })
  productId = (await db.product.create({ data: { organizationId: runId, name: "API test", description: "Integration", provider: "MTN", price: 0.1 } })).id
  const owner = await db.user.create({ data: { organizationId: runId, role: "SUBSCRIBER", email: `${runId}_owner@api.test` } })
  await db.walletTransaction.create({ data: { userId: owner.id, amount: 100, method: "manual" } })
  key = await db.apiKey.create({ data: { organizationId: runId, name: "Fixture key", key: randomBytes(24).toString("hex"), ownerType: "SUBSCRIBER" } })
  secondKey = await db.apiKey.create({ data: { organizationId: runId, name: "Second fixture", key: randomBytes(24).toString("hex"), ownerType: "SUBSCRIBER" } })
})
beforeEach(async () => {
  provider.dispatch.mockClear()
  await db.auditLog.deleteMany({ where: { organizationId: runId } })
  await db.orderItem.deleteMany({ where: { order: { organizationId: runId } } })
  await db.order.deleteMany({ where: { organizationId: runId } })
  await db.customer.deleteMany({ where: { organizationId: runId } })
})
it("serializes concurrent retries with the same external reference", async () => {
  const responses = await Promise.all([POST(post("same-request")), POST(post("same-request"))])
  expect(responses.map(response => response.status).sort()).toEqual([200, 201])
  expect(await db.order.count({ where: { organizationId: runId } })).toBe(1)
  expect(provider.dispatch).toHaveBeenCalledTimes(1)
})
it("rejects reuse of a reference for a different purchase", async () => {
  expect((await POST(post("different-payload"))).status).toBe(201)
  expect((await POST(post("different-payload", { quantity: 2 }))).status).toBe(409)
  expect(await db.order.count({ where: { organizationId: runId } })).toBe(1)
})
it("keeps external references and order reads scoped to the originating key", async () => {
  const first = await POST(post("shared-reference"))
  const firstOrder = (await first.json()).data.internalOrderId
  expect((await POST(post("shared-reference", {}, secondKey.key))).status).toBe(201)
  expect((await GET(get(firstOrder, secondKey.key))).status).toBe(404)
  expect((await GET(get(firstOrder))).status).toBe(200)
})
it("does not expose an API order with missing key-ownership evidence", async () => {
  const order = await db.order.create({ data: { organizationId: runId, source: "API", total: 5 } })
  expect((await GET(get(order.id))).status).toBe(404)
})
it("rejects fractional-pesewa declared amounts", async () => {
  expect((await POST(post("sub-cent", { amountPaid: 1.001 }))).status).toBe(400)
  expect(await db.order.count({ where: { organizationId: runId } })).toBe(0)
})
it("enforces the per-key rate limit for simultaneous distinct orders", async () => {
  const original = process.env.API_ORDER_RATE_LIMIT_PER_MINUTE
  process.env.API_ORDER_RATE_LIMIT_PER_MINUTE = "1"
  try {
    const responses = await Promise.all([POST(post("rate-one")), POST(post("rate-two"))])
    expect(responses.map(response => response.status).sort()).toEqual([201, 429])
    expect(await db.order.count({ where: { organizationId: runId } })).toBe(1)
  } finally { if (original === undefined) delete process.env.API_ORDER_RATE_LIMIT_PER_MINUTE; else process.env.API_ORDER_RATE_LIMIT_PER_MINUTE = original }
})
it("rejects an inactive agent's key and invalid owner types", async () => {
  const agent = await db.agent.create({ data: { organizationId: runId, name: "Inactive API agent" } })
  const user = await db.user.create({ data: { organizationId: runId, role: "AGENT", active: false, agentId: agent.id, email: `${runId}@api.test` } })
  const ownKey = await db.apiKey.create({ data: { organizationId: runId, name: "Inactive", key: randomBytes(24).toString("hex"), ownerType: "AGENT", ownerUserId: user.id, ownerAgentId: agent.id } })
  const invalid = await db.apiKey.create({ data: { organizationId: runId, name: "Invalid owner", key: randomBytes(24).toString("hex"), ownerType: "INVALID" } })
  expect(await authenticateApiKey(get("unused", ownKey.key))).toBeNull()
  expect(await authenticateApiKey(get("unused", invalid.key))).toBeNull()
})
afterAll(async () => {
  if (!verified) return
  try {
    await db.financialReviewCase.deleteMany({ where: { organizationId: runId } })
    await db.auditLog.deleteMany({ where: { organizationId: runId } })
    await db.orderItem.deleteMany({ where: { order: { organizationId: runId } } })
    await db.order.deleteMany({ where: { organizationId: runId } })
    await db.customer.deleteMany({ where: { organizationId: runId } })
    await db.apiKey.deleteMany({ where: { organizationId: runId } })
    await db.walletTransaction.deleteMany({ where: { user: { organizationId: runId } } })
    await db.user.deleteMany({ where: { organizationId: runId } })
    await db.agent.deleteMany({ where: { organizationId: runId } })
    await db.product.deleteMany({ where: { organizationId: runId } })
    await db.subscription.deleteMany({ where: { organizationId: runId } })
    await db.plan.deleteMany({ where: { name: runId } })
    await db.organization.delete({ where: { id: runId } })
  } finally { await db.$disconnect() }
})
