import { randomBytes } from "node:crypto"
import { afterAll, beforeAll, expect, it, vi } from "vitest"
vi.mock("@/lib/api-order-tracking", () => ({ notifyApiOrderStatus: vi.fn() }))
import { db } from "@/lib/db"
import { createOrderWalletDebit, reverseOrderWalletDebitIfNeeded, prepareOrderWalletRetry } from "@/lib/order-wallet"
import { applyProviderStatusUpdate } from "@/lib/provider-status"
import { recordVerifiedWalletTopup } from "@/lib/wallet-topup"
import { applyManualOrderStatus } from "@/lib/manual-order-status"
import { readLocalConfig, databaseUrl } from "../../scripts/local-environment.mjs"

const runId = `qd_wallet_${randomBytes(6).toString("hex")}`
let verified = false
async function fixture(balance = 100) {
  const user = await db.user.create({ data: { organizationId: runId, email: `${randomBytes(8).toString("hex")}@wallet.test` } })
  await db.walletTransaction.create({ data: { userId: user.id, amount: balance, method: "manual" } })
  const order = await db.order.create({ data: { organizationId: runId, userId: user.id, total: 60 } })
  return { user, order, charge: { organizationId: runId, userId: user.id, orderId: order.id, amount: 60 }, refund: { organizationId: runId, orderId: order.id, reason: "Integration failure" } }
}
async function balance(userId: string) {
  return (await db.walletTransaction.aggregate({ where: { userId, status: "success" }, _sum: { amount: true } }))._sum.amount ?? 0
}
beforeAll(async () => {
  const value = process.env.QUICKDATA_TEST_DATABASE_URL
  if (process.env.QUICKDATA_DATABASE_INTEGRATION !== "1" || !value || value !== process.env.DATABASE_URL || value !== databaseUrl(readLocalConfig(), "quickdata_integration")) throw new Error("Use the isolated integration database")
  verified = true
  await db.organization.create({ data: { id: runId, name: runId, slug: runId } })
})
it("serializes simultaneous spending so only one affordable charge succeeds", async () => {
  const f = await fixture()
  const second = await db.order.create({ data: { organizationId: runId, userId: f.user.id, total: 60 } })
  const results = await Promise.allSettled([createOrderWalletDebit(f.charge), createOrderWalletDebit({ ...f.charge, orderId: second.id })])
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1)
  await expect(balance(f.user.id)).resolves.toBe(40)
})
it("refunds the same debit once even when requests arrive together", async () => {
  const f = await fixture()
  await createOrderWalletDebit(f.charge)
  const refunds = await Promise.all([reverseOrderWalletDebitIfNeeded(f.refund), reverseOrderWalletDebitIfNeeded(f.refund)])
  expect(refunds.filter(result => result.reversed)).toHaveLength(1)
  expect(await balance(f.user.id)).toBe(100)
})
it("refunds a second failed attempt without treating the first refund as final", async () => {
  const f = await fixture()
  await createOrderWalletDebit(f.charge)
  expect((await reverseOrderWalletDebitIfNeeded(f.refund)).reversed).toBe(true)
  await createOrderWalletDebit(f.charge)
  expect((await reverseOrderWalletDebitIfNeeded(f.refund)).reversed).toBe(true)
  expect((await reverseOrderWalletDebitIfNeeded(f.refund)).reversed).toBe(false)
  expect(await balance(f.user.id)).toBe(100)
})
it("rejects negative and non-finite debit amounts without crediting the wallet", async () => {
  const f = await fixture()
  for (const amount of [-60, NaN, Infinity]) await expect(createOrderWalletDebit({ ...f.charge, amount })).rejects.toThrow()
  expect(await balance(f.user.id)).toBe(100)
})
it("rejects a debit for an order outside the supplied organization", async () => {
  const f = await fixture()
  await expect(createOrderWalletDebit({ ...f.charge, organizationId: `${runId}_missing` })).rejects.toThrow()
  expect(await balance(f.user.id)).toBe(100)
})
it("does not let a delayed provider update regress a completed order", async () => {
  const f = await fixture()
  await db.order.update({ where: { id: f.order.id }, data: { status: "COMPLETED" } })
  await applyProviderStatusUpdate({ orderId: f.order.id, status: "PROCESSING", source: "callback" })
  expect((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status).toBe("COMPLETED")
})

it("the database rejects a second credit linked to the same debit", async () => {
  const f = await fixture()
  const debit = await createOrderWalletDebit(f.charge)
  await reverseOrderWalletDebitIfNeeded(f.refund)
  await expect(db.walletTransaction.create({ data: { userId: f.user.id, amount: 60, method: "manual", refundOfTransactionId: debit.id } })).rejects.toThrow()
  expect(await balance(f.user.id)).toBe(100)
})
it("recognizes historical refunds and links them without issuing another credit", async () => {
  const f = await fixture()
  const debit = await createOrderWalletDebit(f.charge)
  const credit = await db.walletTransaction.create({ data: { userId: f.user.id, amount: 60, method: "manual" } })
  await db.auditLog.create({ data: { action: "ORDER_WALLET_REVERSAL", targetType: "ORDER", targetId: f.order.id, organizationId: runId, meta: JSON.stringify({ creditTransactionId: credit.id, reversedAmount: 60 }) } })
  expect((await reverseOrderWalletDebitIfNeeded(f.refund)).reversed).toBe(false)
  expect((await db.walletTransaction.findUniqueOrThrow({ where: { id: credit.id } })).refundOfTransactionId).toBe(debit.id)
  expect(await balance(f.user.id)).toBe(100)
})
it("uses the actual debit amount rather than a tampered audit amount", async () => {
  const f = await fixture()
  const debit = await createOrderWalletDebit(f.charge)
  await db.auditLog.updateMany({ where: { targetId: f.order.id, action: "ORDER_WALLET_DEBIT" }, data: { meta: JSON.stringify({ walletTransactionId: debit.id, userId: f.user.id, amount: 6000 }) } })
  await reverseOrderWalletDebitIfNeeded(f.refund)
  expect(await balance(f.user.id)).toBe(100)
})
it("claims a failed order once across concurrent retry requests", async () => {
  const f = await fixture()
  await createOrderWalletDebit(f.charge)
  await db.order.update({ where: { id: f.order.id }, data: { status: "FAILED" } })
  const retry = { orderId: f.order.id, organizationId: runId, actorId: f.user.id, actorName: "Integration", maxAttempts: 3, backoffSeconds: 30 }
  const results = await Promise.allSettled([prepareOrderWalletRetry(retry), prepareOrderWalletRetry(retry)])
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1)
  expect(await balance(f.user.id)).toBe(40)
  expect((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status).toBe("PENDING")
  await applyProviderStatusUpdate({ orderId: f.order.id, status: "FAILED", source: "poll" })
  expect(await balance(f.user.id)).toBe(100)
  await expect(prepareOrderWalletRetry(retry)).rejects.toThrow("RETRY_BACKOFF")
})
it("does not debit a wallet when retrying an externally paid order", async () => {
  const f = await fixture()
  await db.order.update({ where: { id: f.order.id }, data: { status: "FAILED", paymentOwner: "EXTERNAL" } })
  await prepareOrderWalletRetry({ orderId: f.order.id, organizationId: runId, actorId: f.user.id, actorName: "Integration", maxAttempts: 3, backoffSeconds: 30 })
  expect(await balance(f.user.id)).toBe(100)
})
it("rolls back provider status and refund together when refund auditing fails", async () => {
  const f = await fixture()
  await createOrderWalletDebit(f.charge)
  const functionName = runId + "_refund_fail"
  const triggerName = runId + "_refund_trigger"
  await db.$executeRawUnsafe(`CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."targetId" = '${f.order.id}' AND NEW."action" = 'ORDER_WALLET_REVERSAL' THEN RAISE EXCEPTION 'Deliberate refund audit failure'; END IF; RETURN NEW; END $$`)
  await db.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`)
  try {
    await expect(applyProviderStatusUpdate({ orderId: f.order.id, status: "FAILED", source: "callback" })).rejects.toThrow()
    expect((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status).toBe("PENDING")
    expect(await balance(f.user.id)).toBe(40)
    await expect(applyManualOrderStatus({ orderId: f.order.id, organizationId: runId, status: "FAILED", actorId: f.user.id, actorName: "Integration", action: "ORDER_MANUAL_STATUS_UPDATE" })).rejects.toThrow()
    expect((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status).toBe("PENDING")
    expect(await balance(f.user.id)).toBe(40)
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "AuditLog"`)
    await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`)
  }
})


it("waits for the wallet lock before checking funds", async () => {
  const f = await fixture()
  let release!: () => void
  let acquired!: () => void
  const released = new Promise<void>(resolve => { release = resolve })
  const ready = new Promise<void>(resolve => { acquired = resolve })
  const blocker = db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${f.user.id} FOR UPDATE`
    acquired()
    await released
    await tx.walletTransaction.create({ data: { userId: f.user.id, amount: -50, method: "manual" } })
  }, { timeout: 10000 })
  await ready
  let settled = false
  const spending = createOrderWalletDebit(f.charge).then(() => { settled = true; return "accepted" }, error => { settled = true; return error.message })
  try {
    await vi.waitFor(async () => {
      const rows = await db.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FOR UPDATE%'`
      expect(Number(rows[0].count)).toBeGreaterThan(0)
    }, { timeout: 3000 })
    expect(settled).toBe(false)
  } finally { release(); await blocker }
  expect(await spending).toBe("INSUFFICIENT_FUNDS")
  expect(await balance(f.user.id)).toBe(50)
})
it("ignores a callback referencing an earlier delivery attempt", async () => {
  const f = await fixture()
  await createOrderWalletDebit(f.charge)
  await db.auditLog.create({ data: { action: "ORDER_DISPATCH_ATTEMPT", targetType: "ORDER", targetId: f.order.id, organizationId: runId, meta: JSON.stringify({ externalRef: "current-attempt" }) } })
  await applyProviderStatusUpdate({ orderId: f.order.id, status: "FAILED", source: "callback", externalRef: "old-attempt" })
  expect((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status).toBe("PENDING")
  expect(await balance(f.user.id)).toBe(40)
})


it("manual failure refunds once and cannot be changed back to completed without retry", async () => {
  const f = await fixture()
  await createOrderWalletDebit(f.charge)
  const input = { orderId: f.order.id, organizationId: runId, status: "FAILED", actorId: f.user.id, actorName: "Integration", action: "ORDER_MANUAL_STATUS_UPDATE" }
  await Promise.all([applyManualOrderStatus(input), applyManualOrderStatus(input)])
  expect(await balance(f.user.id)).toBe(100)
  await expect(applyManualOrderStatus({ ...input, status: "COMPLETED" })).rejects.toThrow("INVALID_ORDER_STATUS_TRANSITION")
})
it("rechecks batch eligibility under the order lock", async () => {
  const f = await fixture()
  await db.order.update({ where: { id: f.order.id }, data: { status: "COMPLETED" } })
  const result = await applyManualOrderStatus({ orderId: f.order.id, organizationId: runId, status: "FAILED", actorId: f.user.id, actorName: "Integration", action: "ORDER_BULK_MANUAL_STATUS", expectedStatuses: ["PENDING", "PROCESSING"], manualOnly: true })
  expect(result).toBeNull()
  expect((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status).toBe("COMPLETED")
})
it("ignores an old callback while a new retry awaits its provider reference", async () => {
  const f = await fixture()
  await createOrderWalletDebit(f.charge)
  await db.auditLog.create({ data: { action: "ORDER_DISPATCH_ATTEMPT", targetType: "ORDER", targetId: f.order.id, organizationId: runId, createdAt: new Date(Date.now() - 1000), meta: JSON.stringify({ externalRef: "old-attempt" }) } })
  await db.order.update({ where: { id: f.order.id }, data: { status: "FAILED" } })
  await prepareOrderWalletRetry({ orderId: f.order.id, organizationId: runId, actorId: f.user.id, actorName: "Integration", maxAttempts: 3, backoffSeconds: 30 })
  await applyProviderStatusUpdate({ orderId: f.order.id, status: "FAILED", externalRef: "old-attempt", source: "callback" })
  expect((await db.order.findUniqueOrThrow({ where: { id: f.order.id } })).status).toBe("PENDING")
  expect(await balance(f.user.id)).toBe(40)
})


it("credits one verified Paystack payment once across repeated verification requests", async () => {
  const f = await fixture()
  const reference = randomBytes(12).toString("hex")
  const payment = { reference, status: "success", currency: "GHS", amount: 1020, metadata: { purpose: "wallet_topup", organizationId: runId, walletUserId: f.user.id, walletTopupAmountGHS: 10, walletGrossAmountGHS: 10.20 } }
  const results = await Promise.all([recordVerifiedWalletTopup({ organizationId: runId, reference, fundingOwner: "SUBSCRIBER", payment }), recordVerifiedWalletTopup({ organizationId: runId, reference, fundingOwner: "SUBSCRIBER", payment })])
  expect(results.filter(result => result.credited)).toHaveLength(1)
  expect(await balance(f.user.id)).toBe(110)
})
it("rejects mismatched amount, currency and reference in verified payments", async () => {
  const f = await fixture()
  const reference = randomBytes(12).toString("hex")
  const payment = { reference, status: "success", currency: "GHS", amount: 1020, metadata: { purpose: "wallet_topup", organizationId: runId, walletUserId: f.user.id, walletTopupAmountGHS: 10, walletGrossAmountGHS: 10.20 } }
  for (const patch of [{ amount: 100 }, { currency: "USD" }, { reference: "another-payment" }]) {
    await expect(recordVerifiedWalletTopup({ organizationId: runId, reference, fundingOwner: "SUBSCRIBER", payment: { ...payment, ...patch } })).rejects.toThrow("INVALID_WALLET_PAYMENT")
  }
  expect(await balance(f.user.id)).toBe(100)
})

afterAll(async () => {
  if (!verified) return
  try {
    await db.financialReviewCase.deleteMany({ where: { organizationId: runId } })
    await db.auditLog.deleteMany({ where: { organizationId: runId } })
    await db.walletTransaction.deleteMany({ where: { user: { organizationId: runId } } })
    await db.order.deleteMany({ where: { organizationId: runId } })
    await db.user.deleteMany({ where: { organizationId: runId } })
    await db.organization.delete({ where: { id: runId } })
  } finally { await db.$disconnect() }
})
