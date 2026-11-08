import { afterEach, expect, it, vi } from "vitest"
import { assertLocalDatabase, databaseUrl, localEnvironment } from "../../scripts/local-environment.mjs"

const config = { databasePassword: "a".repeat(48), authSecret: "b".repeat(64), encryptionKey: "c".repeat(64) }
afterEach(() => vi.unstubAllEnvs())

it.each(["quickdata_dev", "quickdata_integration"])("allows only the intended local database: %s", database => {
  expect(assertLocalDatabase(databaseUrl(config, database), database)).toContain(`127.0.0.1:55432/${database}`)
})

it.each([
  "postgresql://quickdata_local:example@database.example.test:55432/quickdata_integration",
  "postgresql://quickdata_local:example@127.0.0.1:5432/quickdata_integration",
  "postgresql://quickdata_local:example@127.0.0.1:55432/postgres",
  "postgresql://postgres:example@127.0.0.1:55432/quickdata_integration",
  "https://quickdata_local:example@127.0.0.1:55432/quickdata_integration",
])("refuses a database outside this environment: %s", value => {
  expect(() => assertLocalDatabase(value, "quickdata_integration")).toThrow()
})

it("does not generate an arbitrary database destination", () => {
  expect(() => databaseUrl(config, "unrelated_business")).toThrow()
})

it("overrides an inherited database and disables inherited external-service keys", () => {
  vi.stubEnv("DATABASE_URL", "postgresql://other.example.test/unrelated")
  vi.stubEnv("PAYSTACK_SECRET_KEY", "inherited-payment-secret")
  vi.stubEnv("PROVIDER_API_KEY", "inherited-provider-secret")
  vi.stubEnv("RESEND_API_KEY", "inherited-mail-secret")
  const env = localEnvironment(config)
  expect(env.DATABASE_URL).toBe(databaseUrl(config))
  expect(env.PAYSTACK_SECRET_KEY).toBe("")
  expect(env.PROVIDER_API_KEY).toBe("")
  expect(env.RESEND_API_KEY).toBe("")
  expect(env.DISPATCH_MODE).toBe("manual")
  expect(env.NEXTAUTH_URL).toBe("http://127.0.0.1:3017")
  expect(env.NEXTAUTH_SECRET).toBe(config.authSecret)
})
