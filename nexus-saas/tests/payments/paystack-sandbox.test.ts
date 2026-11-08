import { afterAll, beforeAll, expect, it } from "vitest"
import { db } from "@/lib/db"
import { getOrganizationPaymentSettings } from "@/lib/organization-payment-settings"
import { databaseUrl, readLocalConfig } from "../../scripts/local-environment.mjs"

let secret = ""
let databaseVerified = false

beforeAll(async () => {
  if (process.env.QUICKDATA_PAYSTACK_TEST !== "1" || process.env.DATABASE_URL !== databaseUrl(readLocalConfig())) {
    throw new Error("Use npm run test:paystack with this checkout's local environment")
  }
  databaseVerified = true
  const org = await db.organization.findUnique({ where: { slug: "local-test-shop" } })
  if (!org) throw new Error("Run npm run setup:local first")
  const settings = await getOrganizationPaymentSettings(org.id)
  if (!settings.paystackConnected || !settings.paystackPublicKey || !settings.paystackSecretKey) {
    throw new Error("Save Paystack test keys in the local app's Customer Payments settings first. No Paystack request was made.")
  }
  if (!settings.paystackPublicKey.startsWith("pk_test_") || !settings.paystackSecretKey.startsWith("sk_test_")) {
    throw new Error("Sandbox checks require both keys in test mode. No Paystack request was made.")
  }
  secret = settings.paystackSecretKey
})

it("authenticates the saved test secret with a read-only Paystack request", async () => {
  let response: Response
  try {
    response = await fetch("https://api.paystack.co/balance", { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(15_000) })
  } catch { throw new Error("Could not reach the Paystack test API; key values are not logged") }
  if (!response.ok) throw new Error(`Paystack rejected the test-key check with HTTP ${response.status}; key values are not logged`)
  const payload = await response.json()
  expect(payload.status).toBe(true)
  expect(Array.isArray(payload.data)).toBe(true)
})

afterAll(async () => { secret = ""; if (databaseVerified) await db.$disconnect() })
