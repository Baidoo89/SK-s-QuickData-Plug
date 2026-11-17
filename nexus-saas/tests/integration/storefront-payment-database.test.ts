import { randomBytes } from "node:crypto"
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"
const state = vi.hoisted(() => ({ payment: {} as Record<string, any>, dispatch: vi.fn(async () => ({ finalStatus: "PENDING", dispatchMode: "MANUAL" })) }))
vi.mock("@/lib/organization-payment-settings", () => ({ getOrganizationPaymentSettings: async () => ({ paystackConnected: true, paystackSecretKey: "sk_test_local_fixture_only" }) }))
vi.mock("@/lib/mail", () => ({ getBaseUrl: () => "http://127.0.0.1:3017" }))
vi.mock("@/lib/order-dispatch", () => ({ resolveOrderDispatch: state.dispatch }))
import { db } from "@/lib/db"
import { settleStorefrontPayment } from "@/lib/storefront-payment-settlement"
import { GET } from "@/app/api/store/paystack/verify/route"
import { expireAbandonedStorefrontPayments } from "@/lib/storefront-payment-cleanup"
import { databaseUrl, readLocalConfig } from "../../scripts/local-environment.mjs"

const runId = `qd_store_${randomBytes(6).toString("hex")}`
let verified = false
let productId: string
async function fixture() {
  const order = await db.order.create({ data: { organizationId: runId, total: 5, status: "PENDING_PAYMENT", paymentStatus: "PENDING", paymentOwner: "STOREFRONT", phoneNumber: "0241234567", items: { create: { productId, quantity: 1, price: 5 } } } })
  const reference = randomBytes(12).toString("hex")
  const payment = await db.storefrontPayment.create({ data: { organizationId: runId, reference, amount: 5, orderIds: JSON.stringify([order.id]), metadata: JSON.stringify({ returnPath: "/shop/integration" }) } })
  state.payment = { status: true, data: { status: "success", reference, currency: "GHS", amount: 500, metadata: { purpose: "storefront_order", organizationId: runId, orderIds: [order.id], returnPath: "/shop/integration" } } }
  return { order, payment, request: () => new Request(`http://localhost/api/store/paystack/verify?reference=${reference}&organizationId=${runId}`) }
}
beforeAll(async () => {
  const value = process.env.QUICKDATA_TEST_DATABASE_URL
  if (process.env.QUICKDATA_DATABASE_INTEGRATION !== "1" || value !== process.env.DATABASE_URL || value !== databaseUrl(readLocalConfig(), "quickdata_integration")) throw new Error("Use the isolated integration database")
  verified = true
  await db.organization.create({ data: { id: runId, name: runId, slug: runId } })
  productId = (await db.product.create({ data: { organizationId: runId, name: "Payment test bundle", description: "Integration", price: 5 } })).id
})
beforeEach(() => {
  state.dispatch.mockClear()
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(state.payment), { status: 200, headers: { "Content-Type": "application/json" } })))
})
it("repeated and concurrent verification dispatches a paid order only once", async () => {
  const f = await fixture()
  const responses = await Promise.all([GET(f.request()), GET(f.request())])
  expect(responses.every(response => response.headers.get("location")?.includes("checkout=success"))).toBe(true)
  expect(state.dispatch).toHaveBeenCalledTimes(1)
  expect((await db.storefrontPayment.findUniqueOrThrow({ where: { id: f.payment.id } })).status).toBe("SUCCESS")
  expect(await db.auditLog.count({ where: { targetId: f.order.id, action: "STOREFRONT_PAYMENT_SUCCESS" } })).toBe(1)
})
it("a later failed verification cannot downgrade a successful payment", async () => {
  const f = await fixture()
  await GET(f.request())
  state.payment.data.status = "failed"
  await GET(f.request())
  expect((await db.storefrontPayment.findUniqueOrThrow({ where: { id: f.payment.id } })).status).toBe("SUCCESS")
  expect((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).paymentStatus).toBe("PAID")
})
for (const patch of [{ currency: "USD" }, { reference: "unrelated-reference" }, { amount: 600 }]) {
  it(`rejects verified payment mismatch ${JSON.stringify(patch)}`, async () => {
    const f = await fixture()
    Object.assign(state.payment.data, patch)
    const response = await GET(f.request())
    expect(response.headers.get("location")).toContain("checkout=failed")
    expect((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).paymentStatus).toBe("PENDING")
    expect(state.dispatch).not.toHaveBeenCalled()
    expect(await db.financialReviewCase.count({ where: { targetId: f.payment.id, kind: "STOREFRONT_PAYMENT" } })).toBe(1)
  })
}
it("gateway metadata cannot substitute an order outside the saved checkout", async () => {
  const f = await fixture()
  const other = await db.order.create({ data: { organizationId: runId, total: 5, status: "PENDING_PAYMENT", paymentStatus: "PENDING", paymentOwner: "STOREFRONT" } })
  state.payment.data.metadata.orderIds = [other.id]
  const response = await GET(f.request())
  expect(response.headers.get("location")).toContain("checkout=failed")
  expect((await db.order.findUniqueOrThrow({ where: { id: other.id } })).paymentStatus).toBe("PENDING")
  expect((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).paymentStatus).toBe("PENDING")
})
it("a verified late payment recovers an expired checkout without losing its order", async () => {
  const f = await fixture()
  await db.storefrontPayment.update({ where: { id: f.payment.id }, data: { createdAt: new Date(Date.now() - 86400000) } })
  await expireAbandonedStorefrontPayments(runId)
  expect((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status).toBe("PAYMENT_FAILED")
  await GET(f.request())
  expect((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status).toBe("PENDING")
  expect((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).paymentStatus).toBe("PAID")
  expect(state.dispatch).toHaveBeenCalledTimes(1)
})

it("recovers when payment committed before the initial dispatch was started", async () => {
  const f = await fixture()
  await settleStorefrontPayment({ reference: f.payment.reference, organizationId: runId, gatewayPayment: state.payment.data })
  expect(state.dispatch).not.toHaveBeenCalled()
  await GET(f.request())
  await GET(f.request())
  expect(state.dispatch).toHaveBeenCalledTimes(1)
})
it("does not blindly retry an uncertain provider request", async () => {
  const f = await fixture()
  state.dispatch.mockRejectedValueOnce(new Error("Simulated provider timeout"))
  const log = vi.spyOn(console, "error").mockImplementation(() => {})
  try {
    await GET(f.request())
    await GET(f.request())
    expect(state.dispatch).toHaveBeenCalledTimes(1)
    expect(await db.auditLog.count({ where: { targetId: f.order.id, action: "STOREFRONT_DISPATCH_NEEDS_REVIEW" } })).toBe(1)
    expect((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).paymentStatus).toBe("PAID")
  } finally { log.mockRestore() }
})
it("settles service payments once without dispatching a data order", async () => {
  const service = await db.serviceRequest.create({ data: { organizationId: runId, productId, customerName: "Integration", phoneNumber: "0241234567", total: 5 } })
  const reference = randomBytes(12).toString("hex")
  const payment = await db.storefrontPayment.create({ data: { organizationId: runId, reference, amount: 5, orderIds: "[]", metadata: JSON.stringify({ serviceRequestIds: [service.id] }) } })
  state.payment = { status: true, data: { status: "success", reference, currency: "GHS", amount: 500, metadata: { purpose: "storefront_service_request", organizationId: runId, serviceRequestIds: [service.id], returnPath: "/shop/integration" } } }
  const request = () => new Request(`http://localhost/api/store/paystack/verify?reference=${reference}&organizationId=${runId}`)
  await Promise.all([GET(request()), GET(request())])
  const saved = await db.serviceRequest.findUniqueOrThrow({ where: { id: service.id } })
  expect(saved.status).toBe("PENDING_REVIEW")
  expect(saved.paymentStatus).toBe("PAID")
  expect(saved.paymentReference).toBe(reference)
  expect((await db.storefrontPayment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("SUCCESS")
  expect(state.dispatch).not.toHaveBeenCalled()
})
it("rolls back settlement if writing its success audit fails", async () => {
  const f = await fixture()
  const fn = runId + "_settle_fail"; const trigger = runId + "_settle_trigger"
  await db.$executeRawUnsafe(`CREATE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN IF NEW."targetId" = '${f.order.id}' AND NEW."action" = 'STOREFRONT_PAYMENT_SUCCESS' THEN RAISE EXCEPTION 'Deliberate settlement failure'; END IF; RETURN NEW; END $body$`)
  await db.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${fn}"()`)
  const log = vi.spyOn(console, "error").mockImplementation(() => {})
  try {
    const response = await GET(f.request())
    expect(response.headers.get("location")).toContain("checkout=failed")
    expect((await db.storefrontPayment.findUniqueOrThrow({ where: { id: f.payment.id } })).status).toBe("PENDING")
    expect((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).paymentStatus).toBe("PENDING")
    expect(state.dispatch).not.toHaveBeenCalled()
  } finally {
    log.mockRestore()
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "AuditLog"`)
    await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`)
  }
})

afterAll(async () => {
  vi.unstubAllGlobals()
  if (!verified) return
  try {
    await db.financialReviewCase.deleteMany({ where: { organizationId: runId } })
    await db.auditLog.deleteMany({ where: { organizationId: runId } })
    await db.storefrontPayment.deleteMany({ where: { organizationId: runId } })
    await db.orderItem.deleteMany({ where: { order: { organizationId: runId } } })
    await db.order.deleteMany({ where: { organizationId: runId } })
    await db.serviceRequest.deleteMany({ where: { organizationId: runId } })
    await db.product.deleteMany({ where: { organizationId: runId } })
    await db.organization.delete({ where: { id: runId } })
  } finally { await db.$disconnect() }
})
