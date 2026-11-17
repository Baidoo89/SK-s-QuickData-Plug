import { randomBytes } from "node:crypto"
import { afterAll, beforeAll, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ email: "" }))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { email: session.email } }) }))
import { db } from "@/lib/db"
import { GET as transactions } from "@/app/api/wallet/transactions/route"
import { POST as credit, GET as wallet } from "@/app/api/agent/wallet/route"
import { POST as withdraw } from "@/app/api/wallet/withdrawals/route"
import { createWithdrawalRequest } from "@/lib/withdrawal-create"
import { getUserWithdrawableSummary } from "@/lib/withdrawal-balance"
import { updateAgentWithdrawalRequest } from "@/lib/withdrawal-review"
import { getWalletBalance, multiplyMoney } from "@/lib/money"
import { databaseUrl, readLocalConfig } from "../../scripts/local-environment.mjs"

const runId = `qd_access_${randomBytes(6).toString("hex")}`
const orgA = runId + "_a"
const orgB = runId + "_b"
let verified = false
async function account(role = "RESELLER", organizationId = orgA, amount = 25) {
  const user = await db.user.create({ data: { email: `${randomBytes(8).toString("hex")}@access.test`, role, organizationId } })
  await db.walletTransaction.create({ data: { userId: user.id, amount, method: "manual" } })
  return user
}
async function read(query: string) {
  const response = await transactions(new Request(`http://localhost/api/wallet/transactions?${query}`))
  expect(response.status).toBe(200)
  return (await response.json()).data
}
async function earner() {
  const user = await account()
  const product = await db.product.create({ data: { name: "Withdrawal test", description: "Local integration", price: 100, organizationId: orgA } })
  await db.order.create({ data: { organizationId: orgA, userId: user.id, status: "COMPLETED", total: 100, items: { create: { productId: product.id, quantity: 1, price: 100, profit: 100 } } } })
  session.email = user.email!
  return user
}
const request = (amount: number) => new Request("http://localhost/api/wallet/withdrawals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount }) })
beforeAll(async () => {
  const value = process.env.QUICKDATA_TEST_DATABASE_URL
  if (process.env.QUICKDATA_DATABASE_INTEGRATION !== "1" || value !== process.env.DATABASE_URL || value !== databaseUrl(readLocalConfig(), "quickdata_integration")) throw new Error("Use the isolated integration database")
  verified = true
  await db.organization.createMany({ data: [{ id: orgA, name: orgA, slug: orgA }, { id: orgB, name: orgB, slug: orgB }] })
})
it("a reseller cannot replace their wallet scope with another user's ID", async () => {
  const actor = await account()
  const other = await account("RESELLER", orgB, 999)
  session.email = actor.email!
  const data = await read(`userId=${other.id}`)
  expect(data.results).toEqual([])
  expect(data.balance).toBe(0)
})
it("self scope remains self-only even for an owner", async () => {
  const actor = await account("SUBSCRIBER")
  const other = await account("RESELLER", orgA, 999)
  session.email = actor.email!
  const data = await read(`scope=self&userId=${other.id}`)
  expect(data.results).toEqual([])
  expect(data.balance).toBe(0)
})
it("owners can filter their own business but cannot cross the tenant boundary", async () => {
  const actor = await account("SUBSCRIBER")
  const same = await account("RESELLER", orgA, 77)
  const foreign = await account("RESELLER", orgB, 999)
  session.email = actor.email!
  expect((await read(`userId=${same.id}`)).balance).toBe(77)
  expect((await read(`userId=${foreign.id}`)).results).toEqual([])
})
it("reseller email and search filters cannot expand the authorized scope", async () => {
  const actor = await account()
  const foreign = await account("RESELLER", orgB, 999)
  session.email = actor.email!
  expect((await read(`userEmail=${encodeURIComponent(foreign.email!)}&q=manual`)).results).toEqual([])
  const own = await read(`userId=${actor.id}&q=manual`)
  expect(own.balance).toBe(25)
  expect(own.results.every((row: { user: { id: string } }) => row.user.id === actor.id)).toBe(true)
})
it("reserves earnings once when two withdrawal requests compete for the same funds", async () => {
  const user = await earner()
  let release!: () => void
  let acquired!: () => void
  const released = new Promise<void>(resolve => { release = resolve })
  const ready = new Promise<void>(resolve => { acquired = resolve })
  const blocker = db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`
    acquired()
    await released
  }, { timeout: 10000 })
  await Promise.race([ready, blocker.then(() => { throw new Error("Lock ended before test") })])
  const pending = [withdraw(request(60)), withdraw(request(60))]
  try {
    await vi.waitFor(async () => {
      const rows = await db.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`
      expect(Number(rows[0].count)).toBeGreaterThanOrEqual(2)
    }, { timeout: 3000 })
  } finally { release(); await blocker }
  const responses = await Promise.all(pending)
  expect(responses.map(response => response.status).sort()).toEqual([201, 400])
  expect(await db.withdrawalRequest.count({ where: { userId: user.id } })).toBe(1)
})
it("returns the remaining earnings after reserving a withdrawal", async () => {
  await earner()
  const response = await withdraw(request(60))
  expect(response.status).toBe(201)
  const data = (await response.json()).data
  expect(data.availableBalance).toBe(40)
  expect(data.lockedAmount).toBe(60)
})
it("rejects fractional-pesewa withdrawal amounts", async () => {
  const user = await earner()
  expect((await withdraw(request(1.001))).status).toBe(400)
  expect(await db.withdrawalRequest.count({ where: { userId: user.id } })).toBe(0)
})

it("sums repeated fractional-GHS wallet entries exactly", async () => {
  const user = await account("RESELLER", orgA, 0)
  await db.walletTransaction.createMany({ data: Array.from({ length: 100 }, () => ({ userId: user.id, amount: 0.1, method: "manual" })) })
  expect(await getWalletBalance(db, user.id)).toBe(10)
  expect(multiplyMoney(0.1, 3)).toBe(0.3)
})
it("sums fractional completed-order earnings exactly", async () => {
  const user = await account()
  const product = await db.product.create({ data: { name: "Exact profit", description: "Integration", price: 0.1, organizationId: orgA } })
  for (let index = 0; index < 3; index++) await db.order.create({ data: { organizationId: orgA, userId: user.id, status: "COMPLETED", total: 0.1, items: { create: { productId: product.id, quantity: 1, price: 0.1, profit: 0.1 } } } })
  expect((await getUserWithdrawableSummary(user.id)).availableBalance).toBe(0.3)
})
it("rolls back withdrawal reservations when audit insertion fails", async () => {
  const user = await earner()
  const fn = runId + "_create_fail"
  const trigger = runId + "_create_trigger"
  await db.$executeRawUnsafe(`CREATE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN IF NEW."actorId" = '${user.id}' AND NEW."action" = 'WITHDRAWAL_REQUESTED' THEN RAISE EXCEPTION 'Deliberate withdrawal audit failure'; END IF; RETURN NEW; END $body$`)
  await db.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${fn}"()`)
  try {
    await expect(createWithdrawalRequest({ id: user.id, email: user.email!, role: user.role, organizationId: orgA }, 60, "")).rejects.toThrow()
    expect(await db.withdrawalRequest.count({ where: { userId: user.id } })).toBe(0)
    expect((await getUserWithdrawableSummary(user.id)).availableBalance).toBe(100)
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "AuditLog"`)
    await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`)
  }
})
it("reviews agent withdrawals once and rolls back status if audit insertion fails", async () => {
  const user = await account("AGENT")
  const agent = await db.agent.create({ data: { name: "Integration agent", organizationId: orgA } })
  await db.user.update({ where: { id: user.id }, data: { agentId: agent.id } })
  const owner = await account("SUBSCRIBER")
  const product = await db.product.create({ data: { name: "Agent earnings", description: "Integration", price: 100, organizationId: orgA } })
  await db.order.create({ data: { organizationId: orgA, agentId: agent.id, userId: user.id, status: "COMPLETED", total: 100, items: { create: { productId: product.id, quantity: 1, price: 100, profit: 100 } } } })
  const actor = { id: owner.id, email: owner.email!, role: owner.role, organizationId: orgA }
  const created = await createWithdrawalRequest({ id: user.id, email: user.email!, role: user.role, organizationId: orgA }, 60, "")
  const options = { requestId: created.created.id, actor, organizationId: orgA, status: "APPROVED" }
  const responses = await Promise.all([updateAgentWithdrawalRequest(options), updateAgentWithdrawalRequest(options)])
  expect(responses.every(result => result.ok)).toBe(true)
  expect(await db.auditLog.count({ where: { action: "WITHDRAWAL_STATUS_CHANGED", targetId: created.created.id } })).toBe(1)
  expect((await getUserWithdrawableSummary(user.id)).availableBalance).toBe(40)
  const fn = runId + "_review_fail"
  const trigger = runId + "_review_trigger"
  await db.$executeRawUnsafe(`CREATE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN IF NEW."targetId" = '${created.created.id}' AND NEW."action" = 'WITHDRAWAL_STATUS_CHANGED' THEN RAISE EXCEPTION 'Deliberate withdrawal review audit failure'; END IF; RETURN NEW; END $body$`)
  await db.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${fn}"()`)
  try {
    await expect(updateAgentWithdrawalRequest({ ...options, status: "PAID" })).rejects.toThrow()
    expect((await db.withdrawalRequest.findUniqueOrThrow({ where: { id: created.created.id } })).status).toBe("APPROVED")
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "AuditLog"`)
    await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`)
  }
  const foreignOwner = await account("SUBSCRIBER", orgB)
  expect((await updateAgentWithdrawalRequest({ ...options, actor: { id: foreignOwner.id, email: foreignOwner.email!, role: foreignOwner.role, organizationId: orgB }, organizationId: orgB, status: "PAID" })).ok).toBe(false)
})


it("an owner without a business cannot credit another business's wallets", async () => {
  const actor = await db.user.create({ data: { email: `${randomBytes(8).toString("hex")}@access.test`, role: "SUBSCRIBER" } })
  const beneficiary = await account("AGENT", orgB)
  session.email = actor.email!
  try {
    const response = await credit(new Request("http://localhost/api/agent/wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: "manual", beneficiaryEmail: beneficiary.email, amount: 10 }) }))
    expect(response.status).toBe(403)
    expect(await getWalletBalance(db, beneficiary.id)).toBe(25)
  } finally { await db.user.delete({ where: { id: actor.id } }) }
})
it("manual credits reject sub-pesewa amounts and the wallet endpoint reports exact totals", async () => {
  const owner = await account("SUBSCRIBER")
  const beneficiary = await account("RESELLER")
  session.email = owner.email!
  const response = await credit(new Request("http://localhost/api/agent/wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: "manual", beneficiaryEmail: beneficiary.email, amount: 1.001 }) }))
  expect(response.status).toBe(400)
  session.email = beneficiary.email!
  await db.walletTransaction.createMany({ data: Array.from({ length: 3 }, () => ({ userId: beneficiary.id, amount: 0.1, method: "manual" })) })
  expect((await (await wallet()).json()).data.balance).toBe(25.3)
})

afterAll(async () => {
  if (!verified) return
  try {
    const orgs = [orgA, orgB]
    await db.financialReviewCase.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.auditLog.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.withdrawalRequest.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.walletTransaction.deleteMany({ where: { user: { organizationId: { in: orgs } } } })
    await db.orderItem.deleteMany({ where: { order: { organizationId: { in: orgs } } } })
    await db.order.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.product.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.user.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.agent.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.organization.deleteMany({ where: { id: { in: orgs } } })
  } finally { await db.$disconnect() }
})
