import { randomBytes } from "node:crypto"
import { afterAll, beforeAll, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ email: "" }))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { email: session.email } }) }))
vi.mock("@/lib/order-dispatch", () => ({ resolveOrderDispatch: vi.fn(async () => ({ finalStatus: "PENDING", dispatchMode: "MANUAL" })) }))
vi.mock("@/lib/api-order-tracking", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/api-order-tracking")>()), notifyApiOrderStatus: vi.fn() }))
import { db } from "@/lib/db"
import { configureCredit, listCreditAccounts } from "@/lib/credit-account"
import { createOrderWalletDebit, reverseOrderWalletDebitIfNeeded, prepareOrderWalletRetry } from "@/lib/order-wallet"
import { recordVerifiedWalletTopup } from "@/lib/wallet-topup"
import { POST as manualCredit } from "@/app/api/agent/wallet/route"
import { getWalletBalance } from "@/lib/money"
import { applyProviderStatusUpdate } from "@/lib/provider-status"
import { getUserWithdrawableSummary } from "@/lib/withdrawal-balance"
import { POST as apiOrder } from "@/app/api/v1/orders/route"
import { POST as approve, GET as creditList } from "@/app/api/credit-accounts/route"
import { databaseUrl, readLocalConfig } from "../../scripts/local-environment.mjs"
const runId = `qd_credit_${randomBytes(6).toString("hex")}`
const foreignId = runId + "_foreign"
let verified = false
let owner: { id: string; email: string; role: string; organizationId: string }
let foreignOwner: typeof owner
let admin: typeof owner
let productId: string
async function borrower(balance = 0) {
  const agent = await db.agent.create({ data: { organizationId: runId, name: "Credit test agent" } })
  const user = await db.user.create({ data: { organizationId: runId, role: "AGENT", agentId: agent.id, email: `${randomBytes(8).toString("hex")}@credit.test` } })
  await db.walletTransaction.create({ data: { userId: user.id, amount: balance, method: "manual" } })
  const order = await db.order.create({ data: { organizationId: runId, userId: user.id, total: 30 } })
  return { user, order, charge: { orderId: order.id, organizationId: runId, userId: user.id, amount: 30 } }
}
async function permit(userId: string, limit = 50) { return configureCredit(owner, { userId, enabled: true, limit, note: "Integration approval" }) }
beforeAll(async () => {
  const value = process.env.QUICKDATA_TEST_DATABASE_URL
  if (process.env.QUICKDATA_DATABASE_INTEGRATION !== "1" || value !== process.env.DATABASE_URL || value !== databaseUrl(readLocalConfig(), "quickdata_integration")) throw new Error("Use isolated database")
  verified = true
  await db.organization.createMany({ data: [{ id: runId, name: runId, slug: runId }, { id: foreignId, name: foreignId, slug: foreignId }] })
  const makeActor = async (role: string, organizationId: string) => {
    const user = await db.user.create({ data: { organizationId, role, email: `${randomBytes(8).toString("hex")}@credit.test` } })
    return { id: user.id, email: user.email!, role, organizationId }
  }
  owner = await makeActor("SUBSCRIBER", runId); foreignOwner = await makeActor("SUBSCRIBER", foreignId); admin = await makeActor("SUPERADMIN", runId)
  const plan = await db.plan.create({ data: { name: runId, priceGHS: 0, features: "[]", maxProducts: 100, maxAgents: 10 } })
  await db.subscription.create({ data: { organizationId: runId, planId: plan.id, status: "ACTIVE" } })
  productId = (await db.product.create({ data: { organizationId: runId, name: "Credit API bundle", description: "Integration", price: 20 } })).id
})
it("prepaid is the default and insufficient funds leave no charge behind", async () => {
  const f = await borrower(10)
  await expect(createOrderWalletDebit(f.charge)).rejects.toThrow("INSUFFICIENT_FUNDS")
  expect(await getWalletBalance(db, f.user.id)).toBe(10)
  expect(await db.creditAccount.findUnique({ where: { userId: f.user.id } })).toBeNull()
})
it("approved credit records debt, sets the daily deadline and respects the limit", async () => {
  const f = await borrower()
  await permit(f.user.id)
  await createOrderWalletDebit(f.charge)
  expect(await getWalletBalance(db, f.user.id)).toBe(-30)
  const account = await db.creditAccount.findUniqueOrThrow({ where: { userId: f.user.id } })
  expect(account.dueAt!.getUTCHours()).toBe(0)
  expect(account.dueAt!.getTime()).toBeGreaterThan(Date.now())
  await expect(createOrderWalletDebit({ ...f.charge, amount: 25 })).rejects.toThrow("INSUFFICIENT_FUNDS")
  const rows = (await listCreditAccounts(owner)).rows
  expect(rows.find(row => row.userId === f.user.id)).toMatchObject({ owed: 30, availableToSpend: 20, limit: 50 })
})
it("competing purchases cannot exceed one approved limit", async () => {
  const f = await borrower()
  await permit(f.user.id)
  const other = await db.order.create({ data: { organizationId: runId, userId: f.user.id, total: 30 } })
  const results = await Promise.allSettled([createOrderWalletDebit(f.charge), createOrderWalletDebit({ ...f.charge, orderId: other.id })])
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1)
  expect(await getWalletBalance(db, f.user.id)).toBe(-30)
})
it("overdue credit blocks borrowing until repayments clear the debt", async () => {
  const f = await borrower()
  await permit(f.user.id)
  await createOrderWalletDebit(f.charge)
  await db.creditAccount.update({ where: { userId: f.user.id }, data: { dueAt: new Date(Date.now() - 1000) } })
  await expect(createOrderWalletDebit({ ...f.charge, amount: 1 })).rejects.toThrow("CREDIT_OVERDUE")
  await db.walletTransaction.create({ data: { userId: f.user.id, amount: 10, method: "manual" } })
  await expect(createOrderWalletDebit({ ...f.charge, amount: 1 })).rejects.toThrow("CREDIT_OVERDUE")
  await db.walletTransaction.create({ data: { userId: f.user.id, amount: 20, method: "manual" } })
  await createOrderWalletDebit({ ...f.charge, amount: 1 })
  expect(await getWalletBalance(db, f.user.id)).toBe(-1)
  expect((await db.creditAccount.findUniqueOrThrow({ where: { userId: f.user.id } })).dueAt!.getTime()).toBeGreaterThan(Date.now())
})
it("refunds reduce debt and disabling credit never erases an existing debt", async () => {
  const f = await borrower()
  await permit(f.user.id)
  await createOrderWalletDebit(f.charge)
  await configureCredit(owner, { userId: f.user.id, enabled: false, limit: 50, note: "Pause borrowing" })
  expect(await getWalletBalance(db, f.user.id)).toBe(-30)
  await expect(createOrderWalletDebit({ ...f.charge, amount: 1 })).rejects.toThrow("INSUFFICIENT_FUNDS")
  await reverseOrderWalletDebitIfNeeded({ orderId: f.order.id, organizationId: runId, reason: "Failed credit order" })
  expect(await getWalletBalance(db, f.user.id)).toBe(0)
})
it("only authorized managers can approve credit, and borrowers see only themselves", async () => {
  const f = await borrower()
  await expect(configureCredit(owner, { userId: owner.id, enabled: true, limit: 50, note: "Self approval denied" })).rejects.toThrow("CREDIT_FORBIDDEN")
  await expect(configureCredit(foreignOwner, { userId: f.user.id, enabled: true, limit: 50, note: "Foreign approval denied" })).rejects.toThrow("CREDIT_FORBIDDEN")
  await configureCredit(admin, { userId: owner.id, enabled: true, limit: 50, note: "Platform owner approval" })
  session.email = f.user.email!
  const response = await approve(new Request("http://localhost/api/credit-accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: f.user.id, enabled: true, limit: 500, note: "Not permitted" }) }))
  expect(response.status).toBe(403)
  const listed = await creditList(new Request("http://localhost/api/credit-accounts"))
  expect((await listed.json()).data.rows.map((row: { userId: string }) => row.userId)).toEqual([f.user.id])
})
it("API orders charge the seller cost, reject unfunded purchases and use approved credit", async () => {
  const f = await borrower()
  const key = await db.apiKey.create({ data: { organizationId: runId, name: "Credit fixture", key: randomBytes(24).toString("hex"), ownerType: "AGENT", ownerUserId: f.user.id, ownerAgentId: f.user.agentId } })
  const request = () => new Request("http://localhost/api/v1/orders", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key.key}` }, body: JSON.stringify({ productId, phoneNumber: "0241234567", amountPaid: 100, externalReference: "credit-api-test" }) })
  expect((await apiOrder(request())).status).toBe(400)
  expect(await getWalletBalance(db, f.user.id)).toBe(0)
  await permit(f.user.id)
  const response = await apiOrder(request())
  expect(response.status).toBe(201)
  const result = (await response.json()).data
  expect(result.walletCharged).toBe(20)
  expect(await getWalletBalance(db, f.user.id)).toBe(-20)
  expect((await getUserWithdrawableSummary(f.user.id)).profitEarned).toBe(0)
  expect((await apiOrder(request())).status).toBe(200)
  expect(await getWalletBalance(db, f.user.id)).toBe(-20)
  await applyProviderStatusUpdate({ orderId: result.internalOrderId, status: "FAILED", source: "poll" })
  expect(await getWalletBalance(db, f.user.id)).toBe(0)
  await prepareOrderWalletRetry({ orderId: result.internalOrderId, organizationId: runId, maxAttempts: 3, backoffSeconds: 0, actorId: owner.id, actorName: owner.email })
  expect(await getWalletBalance(db, f.user.id)).toBe(-20)
  await applyProviderStatusUpdate({ orderId: result.internalOrderId, status: "FAILED", source: "poll" })
  expect(await getWalletBalance(db, f.user.id)).toBe(0)
})

it("agents fund resellers by transfer and cannot use credit to create a repayable balance", async () => {
  const f = await borrower(20)
  const reseller = await db.user.create({ data: { organizationId: runId, role: "RESELLER", parentAgentId: f.user.agentId, email: `${randomBytes(8).toString("hex")}@credit.test` } })
  session.email = f.user.email!
  const request = (amount: number) => new Request("http://localhost/api/agent/wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: "manual", beneficiaryEmail: reseller.email, amount }) })
  expect((await manualCredit(request(10))).status).toBe(200)
  expect(await getWalletBalance(db, f.user.id)).toBe(10)
  expect(await getWalletBalance(db, reseller.id)).toBe(10)
  await permit(f.user.id, 100)
  expect((await manualCredit(request(11))).status).toBe(400)
  expect(await getWalletBalance(db, f.user.id)).toBe(10)
  expect(await getWalletBalance(db, reseller.id)).toBe(10)
})
it("owner wallet payments use the store merchant while platform accounts stay separate", async () => {
  const makePayment = (userId: string) => {
    const reference = randomBytes(12).toString("hex")
    return { reference, payment: { reference, status: "success", currency: "GHS", amount: 1000, metadata: { purpose: "wallet_topup", organizationId: runId, walletUserId: userId, walletTopupAmountGHS: 10, walletGrossAmountGHS: 10 } } }
  }
  const ownerPayment = makePayment(owner.id)
  await recordVerifiedWalletTopup({ organizationId: runId, fundingOwner: "SUBSCRIBER", ...ownerPayment })
  expect(await getWalletBalance(db, owner.id)).toBe(10)
  const f = await borrower()
  const agentPayment = makePayment(f.user.id)
  await recordVerifiedWalletTopup({ organizationId: runId, fundingOwner: "SUBSCRIBER", ...agentPayment })
  expect(await getWalletBalance(db, f.user.id)).toBe(10)
  await expect(recordVerifiedWalletTopup({ organizationId: runId, fundingOwner: "PLATFORM", ...makePayment(owner.id) })).rejects.toThrow("INVALID_WALLET_PAYMENT")
})
it("credit approvals roll back when their audit cannot be recorded", async () => {
  const f = await borrower()
  const fn = runId + "_approve_fail"; const trigger = runId + "_approve_trigger"
  await db.$executeRawUnsafe(`CREATE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN IF NEW."targetId" = '${f.user.id}' AND NEW."action" = 'CREDIT_LIMIT_CHANGED' THEN RAISE EXCEPTION 'Deliberate credit audit failure'; END IF; RETURN NEW; END $body$`)
  await db.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${fn}"()`)
  try {
    await expect(permit(f.user.id)).rejects.toThrow()
    expect(await db.creditAccount.findUnique({ where: { userId: f.user.id } })).toBeNull()
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "AuditLog"`)
    await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`)
  }
})


it("historical externally collected API margins cannot be withdrawn as platform-held profit", async () => {
  const f = await borrower()
  await db.order.create({ data: { organizationId: runId, userId: f.user.id, agentId: f.user.agentId, source: "API", status: "COMPLETED", total: 100, paymentOwner: "EXTERNAL", items: { create: { productId, quantity: 1, price: 100, profit: 80 } } } })
  expect((await getUserWithdrawableSummary(f.user.id)).profitEarned).toBe(0)
})


it("API purchases honor strict agent pricing profiles instead of bypassing them with base prices", async () => {
  const f = await borrower(25)
  const profile = await db.pricingProfile.create({ data: { organizationId: runId, name: "Strict API agent", targetRole: "AGENT" } })
  await db.pricingProfileItem.create({ data: { pricingProfileId: profile.id, productId, price: 30 } })
  await db.userPricingProfileAssignment.create({ data: { organizationId: runId, userId: f.user.id, pricingProfileId: profile.id, strictPricing: true } })
  const key = await db.apiKey.create({ data: { organizationId: runId, name: "Strict fixture", key: randomBytes(24).toString("hex"), ownerType: "AGENT", ownerUserId: f.user.id, ownerAgentId: f.user.agentId } })
  const request = (reference: string) => new Request("http://localhost/api/v1/orders", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key.key}` }, body: JSON.stringify({ productId, phoneNumber: "0241234567", amountPaid: 100, externalReference: reference }) })
  expect((await apiOrder(request("strict-price"))).status).toBe(400)
  expect(await getWalletBalance(db, f.user.id)).toBe(25)
  await permit(f.user.id)
  const response = await apiOrder(request("strict-price"))
  expect(response.status).toBe(201)
  expect((await response.json()).data.walletCharged).toBe(30)
  expect(await getWalletBalance(db, f.user.id)).toBe(-5)
  await db.pricingProfileItem.deleteMany({ where: { pricingProfileId: profile.id } })
  expect((await apiOrder(request("missing-strict-price"))).status).toBe(400)
  expect(await getWalletBalance(db, f.user.id)).toBe(-5)
})

afterAll(async () => {
  if (!verified) return
  try {
    const orgs = [runId, foreignId]
    await db.financialReviewCase.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.auditLog.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.creditAccount.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.walletTransaction.deleteMany({ where: { user: { organizationId: { in: orgs } } } })
    await db.orderItem.deleteMany({ where: { order: { organizationId: { in: orgs } } } })
    await db.order.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.customer.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.apiKey.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.userPricingProfileAssignment.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.pricingProfile.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.user.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.agent.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.product.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.subscription.deleteMany({ where: { organizationId: { in: orgs } } })
    await db.plan.deleteMany({ where: { name: runId } })
    await db.organization.deleteMany({ where: { id: { in: orgs } } })
  } finally { await db.$disconnect() }
})
