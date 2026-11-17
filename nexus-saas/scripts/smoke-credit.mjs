import { randomBytes } from "node:crypto"
import { readFile, mkdir } from "node:fs/promises"
import path from "node:path"
import bcrypt from "bcryptjs"
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
const email = `credit-ui-${randomBytes(6).toString("hex")}@quickdata.test`
const browser = await chromium.launch({ headless: true })
let userId; let agentId
async function login(page, email, password) {
  await page.goto(`${base}/login`)
  await page.getByLabel("Email", { exact: true }).fill(email)
  await page.getByLabel("Password", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Sign In", exact: true }).click()
  await page.waitForURL(url => url.pathname !== "/login")
}
try {
  const manager = await db.user.findUniqueOrThrow({ where: { email: owner.email } })
  if (!manager.organizationId) throw new Error("Missing local owner organization")
  agentId = (await db.agent.create({ data: { organizationId: manager.organizationId, name: "Temporary credit browser fixture" } })).id
  const user = await db.user.create({ data: { name: "Credit browser fixture", email, role: "AGENT", organizationId: manager.organizationId, agentId, password: await bcrypt.hash(config.accountPassword, 10), emailVerified: new Date() } })
  userId = user.id
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  await login(page, owner.email, owner.password)
  await page.goto(`${base}/dashboard`)
  await expect(page.getByTestId("dashboard-credit-status")).toBeVisible()
  await page.goto(`${base}/dashboard/credit`)
  await page.getByLabel("Find an account").fill(email)
  await page.getByRole("button", { name: "Search accounts", exact: true }).click()
  const card = page.getByTestId(`credit-account-${userId}`)
  await expect(card).toBeVisible()
  await card.getByRole("button", { name: "Set credit for Credit browser fixture", exact: true }).click()
  await page.getByLabel("Allow credit purchases").check()
  await page.getByLabel("Credit limit (GHS)").fill("25.00")
  await page.getByLabel("Approval note").fill("Local browser verification")
  await page.getByRole("button", { name: "Save credit limit", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(card.getByText("Credit approved", { exact: true })).toBeVisible()
  const credit = await db.creditAccount.findUniqueOrThrow({ where: { userId } })
  expect(credit.limitMinor).toBe(2500n)
  expect(credit.enabled).toBe(true)
  // Synthetic local ledger fixture for display only; no payment/provider call.
  await db.walletTransaction.create({ data: { userId, amount: -5, method: "manual", performedByRole: "LOCAL_BROWSER_FIXTURE" } })
  const now = new Date()
  await db.creditAccount.update({ where: { userId }, data: { dueAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)) } })
  await page.getByRole("button", { name: "Search accounts", exact: true }).click()
  await expect(card.getByText("Amount owed", { exact: true }).locator("..")).toContainText("5.00")
  await mkdir(path.join(projectRoot, "docs/previews"), { recursive: true })
  await page.screenshot({ path: path.join(projectRoot, "docs/previews/credit-and-debt.png"), fullPage: true })
  const borrowerContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const borrower = await borrowerContext.newPage()
  await login(borrower, email, config.accountPassword)
  await borrower.goto(`${base}/agent`)
  const dashboardCredit = borrower.getByTestId("dashboard-credit-status")
  await expect(dashboardCredit).toBeVisible()
  await expect(dashboardCredit).toContainText("Amount owed")
  await expect(dashboardCredit).toContainText("5.00")
  await expect(dashboardCredit).toContainText("25.00")
  await expect(dashboardCredit.getByRole("link", { name: "Open credit details" })).toHaveAttribute("href", "/agent/credit")
  await borrower.goto(`${base}/agent/credit`)
  const ownCard = borrower.getByTestId(`credit-account-${userId}`)
  await expect(ownCard).toBeVisible()
  await expect(ownCard.getByText("Amount owed", { exact: true }).locator("..")).toContainText("5.00")
  await expect(borrower.getByRole("button", { name: /Set credit for/ })).toHaveCount(0)
  await expect(borrower.getByRole("link", { name: "Top up wallet / repay", exact: true })).toHaveAttribute("href", "/agent/wallet")
  const forbidden = await borrowerContext.request.post(`${base}/api/credit-accounts`, { data: { userId, limit: 500, enabled: true, note: "Must be denied" } })
  expect(forbidden.status()).toBe(403)
  expect(await borrower.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await borrower.screenshot({ path: path.join(projectRoot, "docs/previews/credit-and-debt-mobile.png"), fullPage: true })
  console.log("Credit browser checks passed: owner approval persisted, borrower debt/due date displayed, self-approval denied, repayment link and mobile layout verified.")
} finally {
  await browser.close()
  if (userId) {
    await db.auditLog.deleteMany({ where: { OR: [{ targetType: "USER", targetId: userId }, { actorId: userId }] } })
    await db.creditAccount.deleteMany({ where: { userId } })
    await db.walletTransaction.deleteMany({ where: { userId } })
    await db.user.delete({ where: { id: userId } })
  }
  if (agentId) await db.agent.delete({ where: { id: agentId } })
  await db.$disconnect()
}
