import { readFile } from "node:fs/promises"
import path from "node:path"
import { chromium, expect } from "@playwright/test"
import { appPort, localRoot, readLocalConfig, databaseUrl, assertLocalDatabase } from "./local-environment.mjs"

// This script deliberately has no option for an external app or database.
const config = readLocalConfig()
assertLocalDatabase(databaseUrl(config), "quickdata_dev")
const base = `http://127.0.0.1:${appPort}`
const saved = JSON.parse(await readFile(path.join(localRoot, "accounts.json"), "utf8"))
if (saved.url !== `${base}/login`) throw new Error("Unexpected local account origin")
const browser = await chromium.launch({ headless: true })
let ownerContext
let ownerPage
let temporaryProductId
const temporaryName = `Local browser check ${Date.now()}`
const contexts = []

try {
  for (const role of ["SUBSCRIBER", "AGENT", "RESELLER", "SUPERADMIN"]) {
    const account = saved.accounts.find(account => account.role === role)
    if (!account || account.password !== config.accountPassword) throw new Error("Local accounts do not match the generated environment")
    const context = await browser.newContext()
    contexts.push(context)
    const page = await context.newPage()
    page.setDefaultTimeout(30_000)
    await page.goto(`${base}/login`, { timeout: 120_000 })
    await page.getByLabel("Email", { exact: true }).fill(account.email)
    await page.getByLabel("Password", { exact: true }).fill(account.password)
    await page.getByRole("button", { name: "Sign In", exact: true }).click()
    const landing = role === "SUBSCRIBER" ? "/dashboard" : role === "SUPERADMIN" ? "/admin" : `/${role.toLowerCase()}`
    await page.waitForURL(url => url.origin === base && (role === "SUBSCRIBER" ? url.pathname.startsWith("/dashboard") : url.pathname === landing), { timeout: 120_000 })
    const session = await (await context.request.get(`${base}/api/auth/session`)).json()
    expect(session.user?.role).toBe(role)
    console.log(`${role}: real sign-in and role landing passed.`)
    if (role === "SUBSCRIBER") {
      ownerContext = context
      ownerPage = page
      const settings = await (await context.request.get(`${base}/api/payment-settings`)).json()
      if (!settings.data?.paystackConnected) await expect(page.getByRole("heading", { name: "Connect customer payments", level: 2 })).toBeVisible()
      await page.goto(`${base}/dashboard/products`, { timeout: 120_000 })
      await page.getByRole("button", { name: "Add a bundle", exact: true }).click()
      const dialog = page.getByRole("dialog")
      await dialog.getByLabel("Bundle name", { exact: true }).fill(temporaryName)
      await dialog.getByLabel("Base price (GHS)", { exact: true }).fill("4")
      await dialog.getByLabel("Shop price (GHS)", { exact: true }).fill("5.50")
      await dialog.getByRole("button", { name: "Save bundle", exact: true }).click()
      await expect(dialog).toHaveCount(0)
      const payload = await (await context.request.get(`${base}/api/products`)).json()
      const product = payload.data?.find(product => product.name === temporaryName)
      expect(product).toMatchObject({ basePrice: 4, storefrontPrice: 5.5, price: 5.5 })
      temporaryProductId = product.id
      console.log("Owner: bundle creation persisted through the real authenticated API.")
    } else if (role === "AGENT" || role === "RESELLER") {
      for (const response of [
        await context.request.post(`${base}/api/products`, { data: { name: "Should not be created", price: 0 } }),
        await context.request.put(`${base}/api/products/${temporaryProductId}`, { data: { price: 0 } }),
        await context.request.delete(`${base}/api/products/${temporaryProductId}`),
      ]) expect(response.status()).toBe(403)
      console.log(`${role}: create, edit and delete correctly denied.`)
    }
  }
  await ownerPage.getByRole("button", { name: `Edit MTN ${temporaryName}`, exact: true }).click()
  const dialog = ownerPage.getByRole("dialog")
  await dialog.getByLabel("Shop price (GHS)", { exact: true }).fill("5.75")
  await dialog.getByRole("button", { name: "Save bundle", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await ownerPage.reload({ timeout: 120_000 })
  await expect(ownerPage.getByRole("heading", { name: temporaryName, exact: true })).toBeVisible()
  const payload = await (await ownerContext.request.get(`${base}/api/products`)).json()
  expect(payload.data.find(product => product.id === temporaryProductId)).toMatchObject({ price: 5.5, basePrice: 4, storefrontPrice: 5.75 })
  console.log("Owner: edited shop price survives reload; base and legacy prices are preserved.")
  console.log("Full local app smoke checks passed. No payment or provider calls were made.")
} finally {
  if (temporaryProductId && ownerContext) {
    const response = await ownerContext.request.delete(`${base}/api/products/${temporaryProductId}`)
    if (response.status() !== 204) console.error("Temporary local browser-check bundle remains in the catalog.")
  }
  for (const context of contexts) await context.close()
  await browser.close()
}
