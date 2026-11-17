import { randomBytes } from "node:crypto"
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"
const provider = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock("@/lib/dispatch-policy", () => ({ getEffectiveDispatchPolicy: async () => ({ mode: "HYBRID" }), shouldUseProviderApi: () => ({ useApi: true, providerKeys: ["primary"], providerName: "Fixture provider", reason: "Test" }) }))
vi.mock("@/lib/provider-dispatch", () => ({ dispatchOrderToProvider: provider.send }))
vi.mock("@/lib/api-order-tracking", () => ({ notifyApiOrderStatus: vi.fn() }))
import { db } from "@/lib/db"
import { resolveOrderDispatch } from "@/lib/order-dispatch"
import { databaseUrl, readLocalConfig } from "../../scripts/local-environment.mjs"
const runId = `qd_dispatch_${randomBytes(6).toString("hex")}`
let verified = false
beforeAll(async () => {
  const value = process.env.QUICKDATA_TEST_DATABASE_URL
  if (process.env.QUICKDATA_DATABASE_INTEGRATION !== "1" || value !== process.env.DATABASE_URL || value !== databaseUrl(readLocalConfig(), "quickdata_integration")) throw new Error("Use isolated database")
  verified = true
  await db.organization.create({ data: { id: runId, name: runId, slug: runId } })
})
beforeEach(() => { provider.send.mockReset() })
for (const retryable of [true, false]) {
  it(`manual fallback preserves a completion received while provider dispatch was in flight (retryable=${retryable})`, async () => {
    const order = await db.order.create({ data: { organizationId: runId, total: 5 } })
    provider.send.mockImplementationOnce(async () => {
      await db.order.update({ where: { id: order.id }, data: { status: "COMPLETED" } })
      return { attempted: true, accepted: false, immediateStatus: "PENDING", externalRef: null, message: "Fixture rejection", retryable }
    })
    const result = await resolveOrderDispatch({ orderId: order.id, organizationId: runId, productId: "fixture", network: "MTN", phone: "0241234567", quantity: 1, amount: 5 })
    expect(result.finalStatus).toBe("COMPLETED")
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("COMPLETED")
  })
}
it("does not send a provider request for an already completed order", async () => {
  const order = await db.order.create({ data: { organizationId: runId, total: 5, status: "COMPLETED" } })
  const result = await resolveOrderDispatch({ orderId: order.id, organizationId: runId, productId: "fixture", network: "MTN", phone: "0241234567", quantity: 1, amount: 5 })
  expect(result.finalStatus).toBe("COMPLETED")
  expect(provider.send).not.toHaveBeenCalled()
})
afterAll(async () => {
  if (!verified) return
  try {
    await db.financialReviewCase.deleteMany({ where: { organizationId: runId } })
    await db.auditLog.deleteMany({ where: { organizationId: runId } })
    await db.order.deleteMany({ where: { organizationId: runId } })
    await db.organization.delete({ where: { id: runId } })
  } finally { await db.$disconnect() }
})
