import { randomBytes } from "node:crypto"
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ email: "" }))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { email: session.email } }) }))
import { db } from "@/lib/db"
import { claimManualOrders } from "@/lib/manual-order-claim"
import { GET as dashboardExport } from "@/app/api/dashboard/orders/manual/export/route"
import { GET as adminExport } from "@/app/api/admin/orders/manual/export/route"
import { GET as ordersExport } from "@/app/api/orders/route"
import { databaseUrl, readLocalConfig } from "../../scripts/local-environment.mjs"

const runId = `qd_export_${randomBytes(6).toString("hex")}`
const orgA = runId + "_a"
const orgB = runId + "_b"
let verified = false
let owner: { id: string; email: string | null }
let admin: { id: string; email: string | null }
let agent: { id: string; email: string | null }
let reseller: { id: string; email: string | null }
const endpoints = [
  { name: "owner manual export", get: dashboardExport, url: "http://localhost/api/dashboard/orders/manual/export", role: "owner" },
  { name: "admin manual export", get: adminExport, url: "http://localhost/api/admin/orders/manual/export", role: "admin" },
  { name: "orders CSV export", get: ordersExport, url: "http://localhost/api/orders?format=csv", role: "owner" },
]
function request(endpoint: typeof endpoints[number], claim = true) {
  return new Request(endpoint.url + (endpoint.url.includes("?") ? "&" : "?") + `claimPending=${claim ? "true" : "false"}`)
}
async function order(data: { status?: string; paymentStatus?: string; fulfillmentMode?: string; organizationId?: string } = {}) {
  return db.order.create({ data: { organizationId: orgA, total: 5, status: "PENDING", paymentStatus: "PAID", fulfillmentMode: "MANUAL", ...data } })
}
beforeAll(async () => {
  const value = process.env.QUICKDATA_TEST_DATABASE_URL
  if (process.env.QUICKDATA_DATABASE_INTEGRATION !== "1" || value !== process.env.DATABASE_URL || value !== databaseUrl(readLocalConfig(), "quickdata_integration")) throw new Error("Use the isolated integration database")
  verified = true
  await db.organization.createMany({ data: [{ id: orgA, name: orgA, slug: orgA }, { id: orgB, name: orgB, slug: orgB }] })
  const account = (role: string) => db.user.create({ data: { role, organizationId: orgA, email: `${runId}_${role}@export.test` } })
  owner = await account("SUBSCRIBER"); admin = await account("SUPERADMIN"); agent = await account("AGENT"); reseller = await account("RESELLER")
})
beforeEach(async () => {
  if (!verified) return
  await db.auditLog.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } })
  await db.order.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } })
  session.email = owner.email!
})
for (const endpoint of endpoints) {
  it(`${endpoint.name}: a plain download does not change order status`, async () => {
    session.email = (endpoint.role === "admin" ? admin : owner).email!
    const row = await order()
    const response = await endpoint.get(request(endpoint, false))
    expect(response.status).toBe(200)
    expect(await response.text()).toContain(row.id)
    expect((await db.order.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("PENDING")
  })
  it(`${endpoint.name}: concurrent claims export each order once`, async () => {
    session.email = (endpoint.role === "admin" ? admin : owner).email!
    const row = await order()
    const responses = await Promise.all([endpoint.get(request(endpoint)), endpoint.get(request(endpoint))])
    const documents = await Promise.all(responses.map(response => response.text()))
    expect(documents.filter(csv => csv.includes(row.id))).toHaveLength(1)
    expect((await db.order.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("PROCESSING")
    expect(await db.auditLog.count({ where: { targetId: row.id, action: "ORDER_MANUAL_CLAIMED" } })).toBe(1)
  })
  it(`${endpoint.name}: does not claim unpaid or API-dispatched orders`, async () => {
    session.email = (endpoint.role === "admin" ? admin : owner).email!
    const unpaid = await order({ paymentStatus: "PENDING" })
    const automatic = await order({ fulfillmentMode: "API" })
    const response = await endpoint.get(request(endpoint))
    const csv = await response.text()
    expect(csv).not.toContain(unpaid.id)
    expect(csv).not.toContain(automatic.id)
    for (const row of [unpaid, automatic]) expect((await db.order.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("PENDING")
  })
  it(`${endpoint.name}: does not overwrite or export a concurrently completed order`, async () => {
    session.email = (endpoint.role === "admin" ? admin : owner).email!
    const row = await order()
    let release!: () => void; let acquired!: () => void
    const released = new Promise<void>(resolve => { release = resolve })
    const ready = new Promise<void>(resolve => { acquired = resolve })
    const blocker = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${row.id} FOR UPDATE`
      acquired(); await released
      await tx.order.update({ where: { id: row.id }, data: { status: "COMPLETED" } })
    }, { timeout: 10000 })
    await Promise.race([ready, blocker.then(() => { throw new Error("Lock ended before test") })])
    const response = endpoint.get(request(endpoint))
    try {
      await vi.waitFor(async () => {
        const rows = await db.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`
        expect(Number(rows[0].count)).toBeGreaterThan(0)
      }, { timeout: 3000 })
    } finally { release(); await blocker }
    expect(await (await response).text()).not.toContain(row.id)
    expect((await db.order.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("COMPLETED")
    expect(await db.auditLog.count({ where: { targetId: row.id, action: "ORDER_MANUAL_CLAIMED" } })).toBe(0)
  })
}
it("agents and resellers cannot use the owner orders endpoint to read or claim tenant-wide orders", async () => {
  const row = await order()
  for (const actor of [agent, reseller]) {
    session.email = actor.email!
    expect((await ordersExport(new Request("http://localhost/api/orders"))).status).toBe(403)
    expect((await ordersExport(request(endpoints[2]))).status).toBe(403)
  }
  expect((await db.order.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("PENDING")
})
it("owner claims cannot include another business", async () => {
  const own = await order()
  const foreign = await order({ organizationId: orgB })
  const csv = await (await dashboardExport(request(endpoints[0]))).text()
  expect(csv).toContain(own.id)
  expect(csv).not.toContain(foreign.id)
  expect((await db.order.findUniqueOrThrow({ where: { id: foreign.id } })).status).toBe("PENDING")
})

it("rolls back claims when the audit insert fails", async () => {
  const row = await order()
  const fn = runId + "_claim_fail"; const trigger = runId + "_claim_trigger"
  await db.$executeRawUnsafe(`CREATE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN IF NEW."targetId" = '${row.id}' AND NEW."action" = 'ORDER_MANUAL_CLAIMED' THEN RAISE EXCEPTION 'Deliberate claim audit failure'; END IF; RETURN NEW; END $body$`)
  await db.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${fn}"()`)
  try {
    await expect(claimManualOrders([row.id], { id: owner.id, email: owner.email!, role: "SUBSCRIBER", organizationId: orgA })).rejects.toThrow()
    expect((await db.order.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("PENDING")
    expect(await db.auditLog.count({ where: { targetId: row.id, action: "ORDER_MANUAL_CLAIMED" } })).toBe(0)
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "AuditLog"`)
    await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`)
  }
})

afterAll(async () => {
  if (!verified) return
  try {
    const orgs = [orgA, orgB]
    await db.financialReviewCase.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.auditLog.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.order.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.user.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.organization.deleteMany({ where: { id: { in: orgs } } })
  } finally { await db.$disconnect() }
})
