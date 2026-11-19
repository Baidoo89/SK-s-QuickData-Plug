import { test, expect, type Page } from "@playwright/test"

const products = [
  { id: "mtn-1", name: "1 GB", provider: "MTN", category: "DATA_BUNDLE", price: 4.5, basePrice: 4, storefrontPrice: 5, hasBasePrice: true, hasStorefrontPrice: true, active: true, description: "Keep this description", bundleType: "DATA" },
  { id: "tel-5", name: "5 GB", provider: "TELECEL", category: "DATA_BUNDLE", price: 20, basePrice: 20, storefrontPrice: 20, hasBasePrice: false, hasStorefrontPrice: false, active: true },
]

async function openCatalog(page: Page, data = products) {
  await page.route("**/api/products", route => route.fulfill({ json: { data } }))
  await page.goto("/?view=products")
  await expect(page.getByRole("heading", { name: "Products & prices", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Add a bundle", exact: true })).toBeEnabled()
}

test("owner can identify missing prices and filter across networks", async ({ page }) => {
  await openCatalog(page)
  await expect(page.getByRole("heading", { name: "1 GB", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "5 GB", exact: true })).toBeVisible()
  await page.getByRole("button", { name: /Need a price review/ }).click()
  await expect(page.getByRole("heading", { name: "1 GB", exact: true })).toHaveCount(0)
  await expect(page.getByText("Set a base price", { exact: true })).toBeVisible()
  await expect(page.getByText("Set a shop price", { exact: true })).toBeVisible()
  await expect(page.getByText("Set the base price first", { exact: true })).toBeVisible()
  await page.getByLabel("Network", { exact: true }).selectOption("MTN")
  await expect(page.getByRole("heading", { name: "No bundles match these filters" })).toBeVisible()
  await page.getByRole("button", { name: "Clear filters" }).click()
  await page.getByLabel("Find a bundle").fill("5 GB")
  await expect(page.getByRole("heading", { name: "5 GB", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "1 GB", exact: true })).toHaveCount(0)
})

test("owner can update bundle prices inline without opening the full editor", async ({ page }) => {
  await openCatalog(page)
  const requests: Record<string, unknown>[] = []
  await page.route("**/api/products/mtn-1", route => {
    requests.push(route.request().postDataJSON())
    return route.fulfill({ json: { id: "mtn-1", ...route.request().postDataJSON() } })
  })
  await page.getByRole("button", { name: "Edit prices for MTN 1 GB", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.getByLabel("Base price for MTN 1 GB", { exact: true }).fill("4.00")
  await page.getByLabel("Shop price for MTN 1 GB", { exact: true }).fill("5.75")
  await page.getByRole("button", { name: "Save prices", exact: true }).click()
  await expect(page.getByText("GHS 1.75", { exact: true })).toBeVisible()
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({ basePrice: 4, storefrontPrice: 5.75, price: 4.5, active: true })
})

test("adding a bundle explains the difference and submits only when explicitly saved", async ({ page }) => {
  await openCatalog(page, [])
  const requests: unknown[] = []
  await page.route("**/api/products", async route => {
    if (route.request().method() !== "POST") return route.fallback()
    const body = route.request().postDataJSON()
    requests.push(body)
    await new Promise(resolve => setTimeout(resolve, 150))
    await route.fulfill({ status: 201, json: { data: { id: "created-500mb", ...body } } })
  })
  await page.getByRole("button", { name: "Add a bundle", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Network", { exact: true }).selectOption("TELECEL")
  await dialog.getByLabel("Bundle name", { exact: true }).fill("500 MB")
  await dialog.getByLabel("Base price (GHS)", { exact: true }).fill("2.50")
  await dialog.getByLabel("Shop price (GHS)", { exact: true }).fill("3.75")
  await dialog.getByLabel("Bundle name", { exact: true }).focus()
  expect(requests).toEqual([])
  await expect(dialog.getByRole("region", { name: "Pricing summary" })).toContainText("GHS 1.25")
  await dialog.getByRole("button", { name: "Save bundle", exact: true }).evaluate(element => {
    const button = element as HTMLButtonElement
    button.click()
    button.click()
  })
  await expect(dialog).toHaveCount(0)
  expect(requests).toEqual([{ name: "500 MB", provider: "TELECEL", category: "DATA_BUNDLE", bundleType: "DATA", description: "", basePrice: 2.5, storefrontPrice: 3.75, price: 3.75, active: true }])
  await expect(page.getByRole("heading", { name: "500 MB", exact: true })).toBeVisible()
  await expect(page.getByRole("status").filter({ hasText: "500 MB saved" })).toBeVisible()
})

test("editing validates prices, retains failed edits and preserves the legacy default price", async ({ page }) => {
  await openCatalog(page)
  const requests: Record<string, unknown>[] = []
  let fail = true
  await page.route("**/api/products/mtn-1", route => {
    const body = route.request().postDataJSON()
    requests.push(body)
    return route.fulfill(fail ? { status: 503, json: { error: { message: "Temporary save failure" } } } : { json: { id: "mtn-1", ...body } })
  })
  await page.getByRole("button", { name: "Edit MTN 1 GB", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByLabel("Base price (GHS)", { exact: true })).toHaveValue("4")
  await dialog.getByLabel("Shop price (GHS)", { exact: true }).fill("3.00")
  await dialog.getByRole("button", { name: "Save bundle", exact: true }).click()
  await expect(dialog.getByRole("alert")).toContainText("shop price cannot be below")
  expect(requests).toEqual([])
  await dialog.getByLabel("Shop price (GHS)", { exact: true }).fill("5.75")
  await dialog.getByRole("button", { name: "Save bundle", exact: true }).click()
  await expect(dialog.getByRole("alert")).toContainText("Temporary save failure")
  await expect(dialog.getByLabel("Shop price (GHS)", { exact: true })).toHaveValue("5.75")
  fail = false
  await dialog.getByRole("button", { name: "Save bundle", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(requests).toHaveLength(2)
  expect(requests[1]).toMatchObject({ basePrice: 4, storefrontPrice: 5.75, price: 4.5, description: "Keep this description", active: true })
  await expect(page.getByText("GHS 1.75", { exact: true })).toBeVisible()
})

test("cancel discards edits and hiding a bundle uses an explicit save", async ({ page }) => {
  await openCatalog(page)
  const requests: Record<string, unknown>[] = []
  await page.route("**/api/products/mtn-1", route => {
    const body = route.request().postDataJSON()
    requests.push(body)
    expect(route.request().method()).toBe("PUT")
    return route.fulfill({ json: { id: "mtn-1", ...body } })
  })
  await page.getByRole("button", { name: "Edit MTN 1 GB", exact: true }).click()
  await page.getByRole("dialog").getByLabel("Shop price (GHS)", { exact: true }).fill("10.00")
  await page.getByRole("button", { name: "Cancel", exact: true }).click()
  expect(requests).toEqual([])
  await page.getByRole("button", { name: "Edit MTN 1 GB", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByLabel("Shop price (GHS)", { exact: true })).toHaveValue("5")
  await dialog.getByLabel("Show this bundle in my shop").uncheck()
  expect(requests).toEqual([])
  await dialog.getByRole("button", { name: "Save bundle", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({ active: false, price: 4.5, basePrice: 4, storefrontPrice: 5 })
  await expect(page.getByText("MTN · Hidden from shop", { exact: true })).toBeVisible()
})

test("catalog load failures have a retry and the editor fits a phone", async ({ page }) => {
  let unavailable = true
  await page.route("**/api/products", route => route.fulfill(unavailable ? { status: 503, json: { error: { message: "Catalog is temporarily unavailable" } } } : { json: { data: products } }))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/?view=products")
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Catalog is temporarily unavailable")
  unavailable = false
  await page.getByRole("button", { name: "Try loading again", exact: true }).click()
  await expect(page.getByRole("heading", { name: "1 GB", exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await page.getByRole("button", { name: "Add a bundle", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Bundle name", { exact: true }).fill("250 MB")
  await dialog.getByLabel("Base price (GHS)", { exact: true }).fill("0")
  await dialog.getByLabel("Shop price (GHS)", { exact: true }).fill("0")
  await expect(dialog.getByText(/zero shop price means/)).toBeVisible()
  const bounds = await dialog.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.width).toBeLessThanOrEqual(390)
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
})

test("advanced catalog explains when order history prevents deletion", async ({ page }) => {
  await page.route("**/api/products", route => route.fulfill({ json: { data: products } }))
  await page.route("**/api/pricing/profiles", route => route.fulfill({ json: { data: [] } }))
  await page.route("**/api/products/mtn-1", route => route.fulfill({ status: 409, json: { error: { message: "This product has order history. Hide it from sale instead of deleting it." } } }))
  const messages: string[] = []
  page.on("dialog", async dialog => {
    if (dialog.type() === "alert") messages.push(dialog.message())
    await dialog.accept()
  })
  await page.goto("/dashboard/products?tab=advanced")
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  await expect.poll(() => messages).toContain("This product has order history. Hide it from sale instead of deleting it.")
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeVisible()
})
