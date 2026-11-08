import { test, expect, type Page } from "@playwright/test"

async function mockCatalog(page: Page) {
  await page.route("**/api/selling-access/status", route => route.fulfill({ json: { data: { canSell: true } } }))
  await page.route("**/api/networks", route => route.fulfill({ json: { data: [{ id: "MTN", name: "MTN" }, { id: "TELECEL", name: "Telecel" }] } }))
  await page.route("**/api/bundles?*", route => route.fulfill({ json: { data: new URL(route.request().url()).searchParams.get("networkId") === "MTN" ? [
    { id: "mtn-10", name: "10 GB", effectivePrice: 45 }, { id: "mtn-1", name: "1 GB", effectivePrice: 5 },
  ] : [{ id: "tel-5", name: "5 GB", effectivePrice: 20 }] } }))
}

async function chooseBundle(page: Page) {
  await page.getByRole("button", { name: "MTN", exact: true }).click()
  await page.getByLabel("2. Choose your bundle").selectOption("mtn-1")
  await page.getByLabel("3. Enter the recipient number").fill("+233 24 123 4567")
}

for (const role of ["agent", "reseller"] as const) {
  test(`${role}: review before charging and track the resulting order`, async ({ page }) => {
    await mockCatalog(page)
    const purchases: unknown[] = []
    await page.route(`**/api/${role}/buy-data`, async route => {
      purchases.push(route.request().postDataJSON())
      await new Promise(resolve => setTimeout(resolve, 150))
      await route.fulfill({ json: { data: { orderId: "QD-TEST-1", phone: "0241234567", bundle: "1 GB", total: 5, status: "PENDING" } } })
    })
    await page.goto(`/?role=${role}`)
    await chooseBundle(page)
    await page.getByRole("button", { name: "Review purchase", exact: true }).click()
    expect(purchases).toEqual([])
    await expect(page.getByRole("heading", { name: "Check the recipient and total" })).toBeFocused()
    await expect(page.getByText("0241234567", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Edit details", exact: true }).click()
    await expect(page.getByLabel("3. Enter the recipient number")).toHaveValue("+233 24 123 4567")
    await page.getByRole("button", { name: "Review purchase", exact: true }).click()
    await page.getByRole("button", { name: "Confirm & pay GHS 5.00", exact: true }).evaluate(element => {
      const button = element as HTMLButtonElement
      button.click()
      button.click()
    })
    await expect(page.getByRole("heading", { name: "Order recorded", exact: true })).toBeVisible()
    expect(purchases).toEqual([{ phone: "0241234567", bundleId: "mtn-1", quantity: 1 }])
    await expect(page.getByText("Waiting for processing", { exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "Track in Orders", exact: true })).toHaveAttribute("href", `/${role}/orders`)
  })
}

test("loading errors show a working retry", async ({ page }) => {
  await mockCatalog(page)
  let unavailable = true
  await page.route("**/api/networks", route => route.fulfill(unavailable ? { status: 503, json: { error: { message: "Networks temporarily unavailable" } } } : { json: { data: [{ id: "MTN", name: "MTN" }] } }))
  await page.goto("/")
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Networks temporarily unavailable")
  unavailable = false
  await page.getByRole("button", { name: "Retry networks" }).click()
  await expect(page.getByRole("button", { name: "MTN", exact: true })).toBeVisible()
})

test("changing networks does not reuse the previous bundle or a stale response", async ({ page }) => {
  await mockCatalog(page)
  let release!: () => void
  const slowResponse = new Promise<void>(resolve => { release = resolve })
  let mtnRequested!: () => void
  const requested = new Promise<void>(resolve => { mtnRequested = resolve })
  await page.route("**/api/bundles?networkId=MTN", async route => {
    mtnRequested()
    await slowResponse
    await route.fulfill({ json: { data: [{ id: "mtn-1", name: "1 GB", effectivePrice: 5 }] } }).catch(() => {})
  })
  await page.goto("/")
  await page.getByRole("button", { name: "MTN", exact: true }).click()
  await requested
  await page.getByRole("button", { name: "Telecel", exact: true }).click()
  await page.getByLabel("2. Choose your bundle").selectOption("tel-5")
  release()
  await expect(page.getByLabel("2. Choose your bundle")).toHaveValue("tel-5")
  await expect(page.getByLabel("2. Choose your bundle").locator("option")).toHaveCount(2)
  await expect(page.getByRole("button", { name: "Telecel", exact: true })).toHaveAttribute("aria-pressed", "true")
})

test("invalid recipient stays on the form and a declined order explains recovery", async ({ page }) => {
  await mockCatalog(page)
  await page.route("**/api/agent/buy-data", route => route.fulfill({ status: 400, json: { error: { message: "Insufficient wallet balance" } } }))
  await page.goto("/")
  await chooseBundle(page)
  await page.getByLabel("3. Enter the recipient number").fill("123")
  await page.getByRole("button", { name: "Review purchase", exact: true }).click()
  await expect(page.getByRole("main").getByRole("alert")).toContainText("10-digit Ghana number")
  await page.getByLabel("3. Enter the recipient number").fill("0241234567")
  await page.getByRole("button", { name: "Review purchase", exact: true }).click()
  await page.getByRole("button", { name: "Confirm & pay GHS 5.00", exact: true }).click()
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Insufficient wallet balance")
  await expect(page.getByRole("link", { name: "add funds to your wallet" })).toHaveAttribute("href", "/agent/wallet")
  await expect(page.getByRole("heading", { name: "Order recorded" })).toHaveCount(0)
})

test("selling restrictions prevent purchases", async ({ page }) => {
  await mockCatalog(page)
  await page.route("**/api/selling-access/status", route => route.fulfill({ json: { data: { canSell: false, reason: "Store owner must connect payments" } } }))
  await page.goto("/")
  await expect(page.getByText("Store owner must connect payments")).toBeVisible()
  await expect(page.getByRole("button", { name: "MTN", exact: true })).toBeDisabled()
  await expect(page.getByRole("button", { name: "Review purchase", exact: true })).toBeDisabled()
})

test("owner setup points to the first incomplete step and hides optional tools", async ({ page }) => {
  await page.goto("/?view=setup&done=2")
  await expect(page.getByRole("link", { name: "Connect Paystack", exact: true }).first()).toHaveAttribute("href", "/dashboard/settings#payments")
  await expect(page.getByRole("progressbar", { name: "Shop setup progress" })).toHaveAttribute("value", "2")
  await expect(page.getByRole("link", { name: "Manage API keys", exact: true })).toBeHidden()
  await page.getByText("Optional tools — add these when you need them", { exact: true }).click()
  await expect(page.getByRole("link", { name: "Manage API keys", exact: true })).toBeVisible()
  await page.goto("/?view=setup&done=5")
  await expect(page.getByRole("heading", { name: "Setup complete", exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "Preview my shop", exact: true })).toHaveAttribute("href", "/store/test-shop")
})

test("mobile navigation exposes daily tasks and keeps advanced tools reachable", async ({ page }) => {
  await mockCatalog(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/")
  await page.getByRole("button", { name: "Open navigation", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("link", { name: "Buy data", exact: true })).toBeVisible()
  await expect(dialog.getByRole("link", { name: "Orders", exact: true })).toBeVisible()
  await dialog.getByText("More sales tools", { exact: true }).click()
  await expect(dialog.getByRole("link", { name: "Buy for many numbers", exact: true })).toBeVisible()
  await dialog.getByRole("button", { name: "Close", exact: true }).click()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  expect(overflow).toBe(false)
})

test("customer reviews and edits the order before starting payment", async ({ page }) => {
  let checkoutCount = 0
  let checkout: unknown
  await page.route("**/api/store/checkout", route => {
    checkoutCount++
    checkout = route.request().postDataJSON()
    return route.fulfill({ status: 503, json: { error: { message: "Payment service unavailable. Please try again later." } } })
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/?view=store")
  await page.getByLabel("2. Choose a bundle").selectOption("mtn-1")
  await page.getByLabel("3. Enter the recipient number").fill("0241234567")
  await page.getByRole("button", { name: "Review order", exact: true }).click()
  expect(checkoutCount).toBe(0)
  await expect(page.getByRole("heading", { name: "Review your order", exact: true })).toBeFocused()
  await expect(page.getByText("Recipient: 0241234567", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Edit details", exact: true }).click()
  await expect(page.getByLabel("3. Enter the recipient number")).toHaveValue("0241234567")
  await page.getByRole("button", { name: "Review order", exact: true }).click()
  await page.getByRole("button", { name: "Continue to payment", exact: true }).click()
  await expect(page.getByRole("alert").filter({ hasText: "Payment service unavailable" }).first()).toBeVisible()
  expect(checkoutCount).toBe(1)
  expect(checkout).toMatchObject({ subscriberSlug: "test-shop", items: [{ productId: "mtn-1", phoneNumber: "0241234567", quantity: 1 }] })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
})
