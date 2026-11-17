import { randomBytes } from "node:crypto"
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"
const state = vi.hoisted(() => ({ email: "", secret: "sk_test_billing_fixture_only" as string | null, payments: new Map<string, any>() }))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { email: state.email } }) }))
vi.mock("@/lib/paystack", () => ({ getSubscriptionPaystackSecret: () => state.secret }))
vi.mock("@/lib/mail", () => ({ getBaseUrl: () => "http://127.0.0.1:3017" }))
import { db } from "@/lib/db"
import { POST as checkout } from "@/app/api/paystack/checkout/route"
import { GET as verify } from "@/app/api/paystack/verify/route"
import { getNextBillingDate, refreshOrganizationSubscriptionStatus } from "@/lib/subscription-access"
import { databaseUrl, readLocalConfig } from "../../scripts/local-environment.mjs"
const runId = `qd_billing_${randomBytes(6).toString("hex")}`
const futureDate = new Date("2030-01-15T12:00:00Z")
let verified = false
let planId: string
let owner: { id: string; email: string | null }
let agent: { id: string; email: string | null }
const request = (reference: string) => new Request(`http://localhost/api/paystack/verify?reference=${encodeURIComponent(reference)}`)
async function quote() {
  const response = await checkout(new Request("http://localhost/api/paystack/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId }) }))
  expect(response.status).toBe(200)
  return (await response.json()).data.reference as string
}
async function subscription() { return db.subscription.findUniqueOrThrow({ where: { organizationId: runId } }) }
beforeAll(async () => {
  const value = process.env.QUICKDATA_TEST_DATABASE_URL
  if (process.env.QUICKDATA_DATABASE_INTEGRATION !== "1" || value !== process.env.DATABASE_URL || value !== databaseUrl(readLocalConfig(), "quickdata_integration")) throw new Error("Use isolated database")
  verified = true
  await db.organization.create({ data: { id: runId, name: runId, slug: runId } })
  planId = (await db.plan.create({ data: { name: runId, priceGHS: 25, features: "[]", maxProducts: 100, maxAgents: 10 } })).id
  owner = await db.user.create({ data: { organizationId: runId, role: "SUBSCRIBER", email: `${runId}_owner@billing.test` } })
  agent = await db.user.create({ data: { organizationId: runId, role: "AGENT", email: `${runId}_agent@billing.test` } })
})
beforeEach(async () => {
  state.email = owner.email!; state.secret = "sk_test_billing_fixture_only"; state.payments.clear()
  if ((db as any).subscriptionCheckout) await (db as any).subscriptionCheckout.deleteMany({ where: { organizationId: runId } })
  await db.payment.deleteMany({ where: { subscription: { organizationId: runId } } })
  await db.subscription.deleteMany({ where: { organizationId: runId } })
  await db.auditLog.deleteMany({ where: { organizationId: runId } })
  await db.plan.update({ where: { id: planId }, data: { priceGHS: 25 } })
  await db.subscription.create({ data: { organizationId: runId, planId, status: "PENDING", nextBillingAt: futureDate } })
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith("/initialize")) {
      const body = JSON.parse(String(options?.body))
      const reference = body.reference || randomBytes(12).toString("hex")
      state.payments.set(reference, { status: true, data: { reference, currency: "GHS", amount: body.amount, status: "success", metadata: body.metadata } })
      return new Response(JSON.stringify({ status: true, data: { reference, authorization_url: "https://checkout.paystack.com/fixture", access_code: "fixture" } }), { status: 200 })
    }
    const reference = decodeURIComponent(url.split("/").pop()!)
    return new Response(JSON.stringify(state.payments.get(reference)), { status: 200 })
  }))
})
it("applies a valid subscription payment once", async () => {
  const reference = await quote()
  expect((await verify(request(reference))).status).toBe(307)
  const first = await subscription()
  await verify(request(reference))
  expect((await subscription()).nextBillingAt).toEqual(first.nextBillingAt)
  expect(await db.payment.count({ where: { paystackRef: reference } })).toBe(1)
})
for (const patch of [{ amount: 1 }, { currency: "USD" }, { reference: "different-reference" }]) {
  it(`rejects subscription payment mismatch ${JSON.stringify(patch)}`, async () => {
    const reference = await quote()
    Object.assign(state.payments.get(reference).data, patch)
    const response = await verify(request(reference))
    expect(response.status).toBe(400)
    expect((await subscription()).status).toBe("PENDING")
    expect(await db.payment.count({ where: { paystackRef: reference } })).toBe(0)
  })
}
it("does not activate a subscription from an unknown checkout reference", async () => {
  const reference = `${runId}_unknown_${randomBytes(6).toString("hex")}`
  state.payments.set(reference, { status: true, data: { reference, currency: "GHS", amount: 2500, status: "success", metadata: { purpose: "platform_subscription", organizationId: runId, planId } } })
  expect((await verify(request(reference))).status).toBe(400)
  expect((await subscription()).status).toBe("PENDING")
  expect(await db.financialReviewCase.count({ where: { reference, kind: "SUBSCRIPTION_PAYMENT", organizationId: null } })).toBe(1)
})
it("honors the saved checkout price when the plan price changes", async () => {
  const reference = await quote()
  await db.plan.update({ where: { id: planId }, data: { priceGHS: 30 } })
  expect((await verify(request(reference))).status).toBe(307)
  expect((await db.payment.findUniqueOrThrow({ where: { paystackRef: reference } })).amount).toBe(25)
})
it("expires stale quotes without activating access and sends the payment to review", async () => {
  const reference = await quote()
  await db.subscriptionCheckout.update({ where: { reference }, data: { expiresAt: new Date("2000-01-01T00:00:00Z") } })
  const response = await verify(request(reference))
  expect(response.status).toBe(400)
  expect((await subscription()).status).toBe("PENDING")
  expect((await db.subscriptionCheckout.findUniqueOrThrow({ where: { reference } })).status).toBe("EXPIRED")
  expect(await db.payment.count({ where: { paystackRef: reference } })).toBe(0)
  expect(await db.financialReviewCase.count({ where: { reference, kind: "SUBSCRIPTION_PAYMENT", organizationId: runId } })).toBe(1)
})
it("serializes distinct successful payments so both billing periods are credited", async () => {
  const first = await quote(); const second = await quote()
  const responses = await Promise.all([verify(request(first)), verify(request(second))])
  expect(responses.every(response => response.status === 307)).toBe(true)
  expect((await subscription()).nextBillingAt).toEqual(getNextBillingDate(futureDate, 2))
})
it("does not activate paid access when development billing keys are absent", async () => {
  state.secret = null
  const response = await checkout(new Request("http://localhost/api/paystack/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId }) }))
  expect(response.status).toBe(400)
  expect((await subscription()).status).toBe("PENDING")
})
it("agents cannot initialize owner subscription purchases", async () => {
  state.email = agent.email!
  const response = await checkout(new Request("http://localhost/api/paystack/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId }) }))
  expect(response.status).toBe(403)
})
it("rolls back activation when the payment record cannot be inserted", async () => {
  const reference = await quote()
  const fn = runId + "_payment_fail"; const trigger = runId + "_payment_trigger"
  await db.$executeRawUnsafe(`CREATE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN IF NEW."paystackRef" = '${reference}' THEN RAISE EXCEPTION 'Deliberate payment record failure'; END IF; RETURN NEW; END $body$`)
  await db.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON "Payment" FOR EACH ROW EXECUTE FUNCTION "${fn}"()`)
  const log = vi.spyOn(console, "error").mockImplementation(() => {})
  try {
    await verify(request(reference))
    expect((await subscription()).status).toBe("PENDING")
    expect((await subscription()).nextBillingAt).toEqual(futureDate)
  } finally {
    log.mockRestore()
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "Payment"`)
    await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`)
  }
})

it("concurrent replay of one reference creates one payment and one billing period", async () => {
  const reference = await quote()
  const responses = await Promise.all([verify(request(reference)), verify(request(reference))])
  expect(responses.every(response => response.status === 307)).toBe(true)
  expect((await subscription()).nextBillingAt).toEqual(getNextBillingDate(futureDate))
  expect(await db.payment.count({ where: { paystackRef: reference } })).toBe(1)
  expect(await db.auditLog.count({ where: { organizationId: runId, action: "SUBSCRIPTION_PAYMENT_APPLIED" } })).toBe(1)
})
it("gateway metadata cannot substitute a different plan from the saved quote", async () => {
  const reference = await quote()
  const other = await db.plan.create({ data: { name: runId + "_other", priceGHS: 50, features: "[]", maxProducts: 100, maxAgents: 10 } })
  state.payments.get(reference).data.metadata.planId = other.id
  expect((await verify(request(reference))).status).toBe(400)
  expect((await subscription()).planId).toBe(planId)
  expect((await subscription()).status).toBe("PENDING")
})
it("a stale expiry refresh cannot overwrite a concurrent paid renewal", async () => {
  const row = await db.subscription.update({ where: { organizationId: runId }, data: { status: "ACTIVE", nextBillingAt: new Date("2000-01-01T00:00:00Z") } })
  let release!: () => void; let acquired!: () => void
  const released = new Promise<void>(resolve => { release = resolve })
  const ready = new Promise<void>(resolve => { acquired = resolve })
  const blocker = db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Subscription" WHERE "id" = ${row.id} FOR UPDATE`
    acquired(); await released
    await tx.subscription.update({ where: { id: row.id }, data: { status: "ACTIVE", nextBillingAt: futureDate } })
  }, { timeout: 10000 })
  await Promise.race([ready, blocker.then(() => { throw new Error("Lock ended before test") })])
  const refreshed = refreshOrganizationSubscriptionStatus(runId)
  try {
    await vi.waitFor(async () => {
      const rows = await db.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`
      expect(Number(rows[0].count)).toBeGreaterThan(0)
    }, { timeout: 3000 })
  } finally { release(); await blocker }
  expect((await refreshed)?.status).toBe("ACTIVE")
  expect((await subscription()).nextBillingAt).toEqual(futureDate)
})

afterAll(async () => {
  vi.unstubAllGlobals()
  if (!verified) return
  try {
    if ((db as any).subscriptionCheckout) await (db as any).subscriptionCheckout.deleteMany({ where: { organizationId: runId } })
    await db.payment.deleteMany({ where: { subscription: { organizationId: runId } } })
    await db.subscription.deleteMany({ where: { organizationId: runId } })
    await db.financialReviewCase.deleteMany({ where: { OR: [{ organizationId: runId }, { organizationId: null, reference: { startsWith: runId } }] } })
    await db.auditLog.deleteMany({ where: { OR: [{ organizationId: runId }, { organizationId: null, targetId: { startsWith: runId } }] } })
    await db.user.deleteMany({ where: { organizationId: runId } })
    await db.plan.deleteMany({ where: { name: { startsWith: runId } } })
    await db.organization.delete({ where: { id: runId } })
  } finally { await db.$disconnect() }
})
