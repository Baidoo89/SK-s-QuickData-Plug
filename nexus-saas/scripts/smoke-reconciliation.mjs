import { randomBytes } from "node:crypto"
import { readFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { PrismaClient } from "@prisma/client"
import { chromium, expect } from "@playwright/test"
import { readLocalConfig, databaseUrl, assertLocalDatabase, localRoot, appPort, projectRoot } from "./local-environment.mjs"
const config = readLocalConfig()
const url = assertLocalDatabase(databaseUrl(config), "quickdata_dev")
const db = new PrismaClient({ datasources: { db: { url } } })
const accounts = JSON.parse(await readFile(path.join(localRoot, "accounts.json"), "utf8"))
const owner = accounts.accounts.find(account => account.role === "SUBSCRIBER")
const base = `http://127.0.0.1:${appPort}`
if (!owner || accounts.url !== `${base}/login`) throw new Error("Unexpected local account configuration")
const marker = `review-ui-${randomBytes(6).toString("hex")}`
const browser = await chromium.launch({ headless: true })
let userId; let orderId
try {
  const manager = await db.user.findUniqueOrThrow({ where: { email: owner.email } })
  if (!manager.organizationId) throw new Error("Missing local owner organization")
  // Synthetic local records only. No payment, delivery or outgoing request.
  orderId = (await db.order.create({ data: { organizationId: manager.organizationId, publicOrderCode: marker, total: 5, status: "PENDING", paymentStatus: "PAID", source: "STOREFRONT" } })).id
  await db.auditLog.create({ data: { organizationId: manager.organizationId, action: "STOREFRONT_DISPATCH_STARTED", targetType: "ORDER", targetId: orderId, meta: JSON.stringify({ reference: marker }), createdAt: new Date(Date.now() - 600000) } })
  userId = (await db.user.create({ data: { email: `${marker}@quickdata.test`, name: marker, role: "AGENT", organizationId: manager.organizationId } })).id
  await db.creditAccount.create({ data: { userId, organizationId: manager.organizationId, enabled: false, limitMinor: BigInt(1000), approvedByUserId: manager.id, note: "Temporary browser fixture", dueAt: new Date(Date.now() - 600000) } })
  await db.walletTransaction.create({ data: { userId, amount: -5, method: "manual", performedByRole: "LOCAL_BROWSER_FIXTURE" } })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  await page.goto(`${base}/login`)
  await page.getByLabel("Email", { exact: true }).fill(owner.email)
  await page.getByLabel("Password", { exact: true }).fill(owner.password)
  await page.getByRole("button", { name: "Sign In", exact: true }).click()
  await page.waitForURL(url => url.pathname !== "/login")
  await page.goto(`${base}/dashboard/reconciliation`)
  await expect(page.getByRole("button", { name: "Refresh queue", exact: true })).toBeEnabled()
  await page.getByLabel("Find a case or overdue account").fill(marker)
  await page.getByRole("button", { name: "Refresh queue", exact: true }).click()
  await expect.poll(() => db.financialReviewCase.count({ where: { targetId: orderId } })).toBe(1)
  const review = await db.financialReviewCase.findFirstOrThrow({ where: { targetId: orderId } })
  const card = page.getByTestId(`review-case-${review.id}`)
  await expect(card).toBeVisible()
  await card.getByRole("button", { name: "Timeline", exact: true }).click()
  await expect(page.getByRole("dialog")).toContainText("PENDING")
  await page.keyboard.press("Escape")
  await card.getByRole("button", { name: "Record review", exact: true }).click()
  await page.getByLabel("Review note / provider evidence").fill("Local verification: provider outcome requires separate confirmation.")
  await page.getByRole("button", { name: "Save review", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.getByLabel("Review status", { exact: true }).selectOption("REVIEWED")
  await expect(card).toContainText("Local verification:")
  expect((await db.financialReviewCase.findUniqueOrThrow({ where: { id: review.id } })).status).toBe("REVIEWED")
  await card.getByRole("button", { name: "Reopen / add note", exact: true }).click()
  await page.getByLabel("Review note / provider evidence").fill("Local verification: reopened pending additional provider evidence.")
  await page.getByRole("button", { name: "Save review", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.getByLabel("Review status", { exact: true }).selectOption("OPEN")
  await expect(card).toContainText("reopened pending")
  expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PENDING")
  expect((await db.walletTransaction.aggregate({ where: { userId }, _sum: { amount: true } }))._sum.amount).toBe(-5)
  const overdue = page.getByTestId(`overdue-account-${userId}`)
  await expect(overdue).toContainText("5.00")
  await mkdir(path.join(projectRoot, "docs/previews"), { recursive: true })
  await page.screenshot({ path: path.join(projectRoot, "docs/previews/financial-review.png"), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(card).toBeVisible()
  await card.scrollIntoViewIfNeeded()
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: path.join(projectRoot, "docs/previews/financial-review-mobile.png"), fullPage: true, animations: "disabled" })
  await overdue.getByRole("link", { name: "Open debt account", exact: true }).click()
  await expect(page.getByTestId(`credit-account-${userId}`)).toContainText("5.00")
  console.log("Financial review browser checks passed: interrupted dispatch imported, timeline loaded, review/reopen persisted, order and wallet unchanged, overdue debt linked, mobile layout verified.")
} finally {
  await browser.close()
  if (orderId) {
    const cases = await db.financialReviewCase.findMany({ where: { targetId: orderId }, select: { id: true } })
    await db.auditLog.deleteMany({ where: { targetId: { in: [orderId, ...cases.map(row => row.id)] } } })
    await db.financialReviewCase.deleteMany({ where: { targetId: orderId } })
    await db.order.delete({ where: { id: orderId } })
  }
  if (userId) {
    await db.creditAccount.deleteMany({ where: { userId } })
    await db.walletTransaction.deleteMany({ where: { userId } })
    await db.user.delete({ where: { id: userId } })
  }
  await db.$disconnect()
}
