import { randomBytes } from "node:crypto"
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ email: "" }))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { email: session.email } }) }))

import { db } from "@/lib/db"
import { POST } from "@/app/api/products/route"
import { PUT, DELETE } from "@/app/api/products/[id]/route"
import { readLocalConfig, databaseUrl } from "../../scripts/local-environment.mjs"

const runId = `qd_it_${randomBytes(6).toString("hex")}`
const orgA = `${runId}_a`
const orgB = `${runId}_b`
const ownerEmail = `${runId}_owner@example.test`
const agentEmail = `${runId}_agent@example.test`
const failFunction = `${runId}_fail_shop`
const failTrigger = `${runId}_shop_trigger`
const lockFunction = `${runId}_lock_delete`
const lockTrigger = `${runId}_delete_trigger`
let productId: string
let databaseVerified = false

const context = (id: string) => ({ params: { id } })
const request = (method: string, body?: unknown) => new Request("http://localhost/api/products", { method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) })

async function readPrices(id: string, organizationId = orgA) {
  return {
    product: await db.product.findUnique({ where: { id } }),
    base: await db.basePrice.findUnique({ where: { productId_organizationId: { productId: id, organizationId } } }),
    shop: await db.subscriberStorefrontPrice.findUnique({ where: { productId_organizationId: { productId: id, organizationId } } }),
  }
}

beforeAll(async () => {
  const value = process.env.QUICKDATA_TEST_DATABASE_URL
  if (process.env.QUICKDATA_DATABASE_INTEGRATION !== "1" || !value || value !== process.env.DATABASE_URL) throw new Error("Use npm run test:db with the isolated local database")
  const url = new URL(value)
  if (url.hostname !== "127.0.0.1" || url.port !== "55432" || url.pathname !== "/quickdata_integration" || url.username !== "quickdata_local") throw new Error("Refusing a database outside the local integration environment")
  if (value !== databaseUrl(readLocalConfig(), "quickdata_integration")) throw new Error("Database does not match this checkout's generated local configuration")
  databaseVerified = true
  await db.$connect()
  await db.organization.createMany({ data: [{ id: orgA, name: "Integration business A", slug: orgA }, { id: orgB, name: "Integration business B", slug: orgB }] })
  await db.user.createMany({ data: [{ email: ownerEmail, organizationId: orgA, role: "SUBSCRIBER", active: true, signupStatus: "APPROVED" }, { email: agentEmail, organizationId: orgA, role: "AGENT", active: true, signupStatus: "APPROVED" }] })
  const plan = await db.plan.create({ data: { name: runId, priceGHS: 0, features: "[]", maxProducts: 100, maxAgents: 10 } })
  await db.subscription.create({ data: { organizationId: orgA, planId: plan.id, status: "ACTIVE" } })
  const product = await db.product.create({ data: { name: "Existing bundle", description: "Integration test", organizationId: orgA, price: 4.5 } })
  productId = product.id
  await db.basePrice.create({ data: { organizationId: orgA, productId, price: 4 } })
  await db.subscriberStorefrontPrice.create({ data: { organizationId: orgA, productId, price: 5 } })
  // Names/IDs below are generated hex identifiers, never external input. This
  // trigger affects this run's organization only, in the integration database.
  await db.$executeRawUnsafe(`CREATE FUNCTION "${failFunction}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."organizationId" = '${orgA}' AND EXISTS (SELECT 1 FROM "Product" WHERE "id" = NEW."productId" AND "name" LIKE 'ROLLBACK-%') THEN RAISE EXCEPTION 'Deliberate integration-test shop-price failure'; END IF; RETURN NEW; END $$`)
  await db.$executeRawUnsafe(`CREATE TRIGGER "${failTrigger}" BEFORE INSERT OR UPDATE ON "SubscriberStorefrontPrice" FOR EACH ROW EXECUTE FUNCTION "${failFunction}"()`)
})

beforeEach(() => {
  session.email = ownerEmail
  vi.spyOn(console, "error").mockImplementation(() => {})
})

it("commits a product and both explicit prices to PostgreSQL", async () => {
  const response = await POST(request("POST", { name: "Successful bundle", price: 8.5, basePrice: 8, storefrontPrice: 10 }))
  expect(response.status).toBe(201)
  const { data } = await response.json()
  const saved = await readPrices(data.id)
  expect(saved.product?.organizationId).toBe(orgA)
  expect(saved.product?.price).toBe(8.5)
  expect(saved.base?.price).toBe(8)
  expect(saved.shop?.price).toBe(10)
})

it("rolls back a new product and base price when the real shop-price write fails", async () => {
  const before = { products: await db.product.count({ where: { organizationId: orgA } }), base: await db.basePrice.count({ where: { organizationId: orgA } }), shop: await db.subscriberStorefrontPrice.count({ where: { organizationId: orgA } }) }
  const response = await POST(request("POST", { name: "ROLLBACK-create", price: 10, basePrice: 8, storefrontPrice: 12 }))
  expect(response.status).toBe(500)
  expect(await db.product.count({ where: { organizationId: orgA } })).toBe(before.products)
  expect(await db.basePrice.count({ where: { organizationId: orgA } })).toBe(before.base)
  expect(await db.subscriberStorefrontPrice.count({ where: { organizationId: orgA } })).toBe(before.shop)
})

it("rolls back product and base-price edits when the real shop-price write fails", async () => {
  const before = await readPrices(productId)
  const response = await PUT(request("PUT", { name: "ROLLBACK-update", price: 20, basePrice: 18, storefrontPrice: 25 }), context(productId))
  expect(response.status).toBe(500)
  expect(await readPrices(productId)).toEqual(before)
})

it("preserves real prices when hiding a product", async () => {
  const before = await readPrices(productId)
  expect((await PUT(request("PUT", { active: false }), context(productId))).status).toBe(200)
  const after = await readPrices(productId)
  expect(after.product?.active).toBe(false)
  expect(after.product?.price).toBe(before.product?.price)
  expect(after.base).toEqual(before.base)
  expect(after.shop).toEqual(before.shop)
})

it("rejects a real agent account and another business's product", async () => {
  session.email = agentEmail
  expect((await PUT(request("PUT", { price: 0 }), context(productId))).status).toBe(403)
  session.email = ownerEmail
  const foreign = await db.product.create({ data: { name: "Other business bundle", description: "Integration test", organizationId: orgB, price: 100 } })
  expect((await PUT(request("PUT", { price: 0 }), context(foreign.id))).status).toBe(404)
  expect((await DELETE(request("DELETE"), context(foreign.id))).status).toBe(404)
  expect((await db.product.findUnique({ where: { id: foreign.id } }))?.price).toBe(100)
})

it("preserves an actual order and its product on deletion", async () => {
  const order = await db.order.create({ data: { organizationId: orgA, total: 5, items: { create: { productId, quantity: 1, price: 5 } } } })
  expect((await DELETE(request("DELETE"), context(productId))).status).toBe(409)
  expect(await db.product.findUnique({ where: { id: productId } })).not.toBeNull()
  expect(await db.orderItem.count({ where: { orderId: order.id, productId } })).toBe(1)
})

it("rolls back price cleanup when an order arrives during deletion", async () => {
  const product = await db.product.create({ data: { name: "Concurrent purchase bundle", description: "Integration test", organizationId: orgA, price: 6 } })
  await db.basePrice.create({ data: { organizationId: orgA, productId: product.id, price: 5 } })
  await db.subscriberStorefrontPrice.create({ data: { organizationId: orgA, productId: product.id, price: 6 } })
  const lockKey = 100_000 + Number.parseInt(randomBytes(3).toString("hex"), 16)
  await db.$executeRawUnsafe(`CREATE FUNCTION "${lockFunction}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD."productId" = '${product.id}' THEN PERFORM pg_advisory_xact_lock(${lockKey}::bigint); END IF; RETURN OLD; END $$`)
  await db.$executeRawUnsafe(`CREATE TRIGGER "${lockTrigger}" BEFORE DELETE ON "SubscriberStorefrontPrice" FOR EACH ROW EXECUTE FUNCTION "${lockFunction}"()`)
  let unlock!: () => void
  let acquired!: () => void
  const waitForRelease = new Promise<void>(resolve => { unlock = resolve })
  const ready = new Promise<void>(resolve => { acquired = resolve })
  const blocker = db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey}::bigint)`
    acquired()
    await waitForRelease
  }, { timeout: 15_000 })
  await Promise.race([ready, blocker.then(() => { throw new Error("Lock transaction ended before it was ready") })])
  const deletion = DELETE(request("DELETE"), context(product.id))
  try {
    await vi.waitFor(async () => {
      const rows = await db.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM pg_locks WHERE locktype = 'advisory' AND objid::bigint = ${lockKey}::bigint AND NOT granted`
      expect(Number(rows[0].count)).toBe(1)
    }, { timeout: 3000, interval: 25 })
    const order = await db.order.create({ data: { organizationId: orgA, total: 6, items: { create: { productId: product.id, quantity: 1, price: 6 } } } })
    unlock()
    await blocker
    expect((await deletion).status).toBe(409)
    const after = await readPrices(product.id)
    expect(after.product).not.toBeNull()
    expect(after.base?.price).toBe(5)
    expect(after.shop?.price).toBe(6)
    expect(await db.orderItem.count({ where: { orderId: order.id, productId: product.id } })).toBe(1)
  } finally {
    unlock()
    await blocker
    await deletion
  }
})

afterAll(async () => {
  // Cleanup is limited to IDs owned by this run, never a database reset.
  if (!databaseVerified) return
  try {
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${failTrigger}" ON "SubscriberStorefrontPrice"`)
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${lockTrigger}" ON "SubscriberStorefrontPrice"`)
    await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${failFunction}"()`)
    await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${lockFunction}"()`)
    const orgs = [orgA, orgB]
    await db.orderItem.deleteMany({ where: { order: { organizationId: { in: orgs } } } })
    await db.order.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.subscriberStorefrontPrice.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.basePrice.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.product.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.user.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.subscription.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.plan.deleteMany({ where: { name: runId } })
    await db.organization.deleteMany({ where: { id: { in: orgs } } })
  } finally { await db.$disconnect(); vi.restoreAllMocks() }
})
