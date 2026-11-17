import { readFile } from "node:fs/promises"
import path from "node:path"
import { chromium, expect } from "@playwright/test"
import { readLocalConfig, localRoot, appPort } from "./local-environment.mjs"

const config = readLocalConfig()
const accounts = JSON.parse(await readFile(path.join(localRoot, "accounts.json"), "utf8"))
const owner = accounts.accounts.find(account => account.role === "SUBSCRIBER")
const base = `http://127.0.0.1:${appPort}`
if (!owner || accounts.url !== `${base}/login`) throw new Error("Unexpected local account configuration")

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(`${base}/login`)
  await page.getByLabel("Email", { exact: true }).fill(owner.email)
  await page.getByLabel("Password", { exact: true }).fill(owner.password)
  await page.getByRole("button", { name: "Sign In", exact: true }).click()
  await page.waitForURL(url => url.pathname !== "/login")
  await page.goto(`${base}/dashboard/analytics?range=7d`)
  const summary = page.getByTestId("financial-reconciliation-summary")
  await expect(summary).toBeVisible()
  await expect(summary).toContainText("Wallet-backed sales")
  await expect(summary).toContainText("Storefront payments")
  await expect(summary).toContainText("External/API sales")
  await expect(summary).toContainText("Withdrawal-eligible margin")
  await expect(summary).toContainText("External margin excluded")
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  console.log("Financial report browser check passed: reconciliation labels and mobile layout verified.")
} finally {
  await browser.close()
}
