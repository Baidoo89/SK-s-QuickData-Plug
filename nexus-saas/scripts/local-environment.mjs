import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

export const projectRoot = fileURLToPath(new URL("../", import.meta.url))
export const localRoot = path.join(projectRoot, ".local")
export const configPath = path.join(localRoot, "environment.json")
export const databasePort = 55432
export const appPort = 3017

export function readLocalConfig() {
  const config = JSON.parse(readFileSync(configPath, "utf8"))
  if (config.kind !== "quickdata-local-only-v1" || !/^[a-f0-9]{48}$/.test(config.databasePassword) || !/^[a-f0-9]{64}$/.test(config.authSecret) || !/^[a-f0-9]{64}$/.test(config.encryptionKey) || typeof config.accountPassword !== "string" || config.accountPassword.length < 12) {
    throw new Error("Unrecognized local environment. Run npm run setup:local first.")
  }
  return config
}

export function databaseUrl(config, database = "quickdata_dev") {
  if (!["quickdata_dev", "quickdata_integration"].includes(database)) throw new Error("Unsupported local database name")
  return `postgresql://quickdata_local:${encodeURIComponent(config.databasePassword)}@127.0.0.1:${databasePort}/${database}?schema=public&connection_limit=8`
}

export function assertLocalDatabase(value, database) {
  const url = new URL(value)
  if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || url.port !== String(databasePort) || url.pathname !== `/${database}` || url.username !== "quickdata_local") {
    throw new Error("Refusing to use a database outside the isolated QuickData local environment")
  }
  return value
}

/** @returns {NodeJS.ProcessEnv & { DATABASE_URL: string }} */
export function localEnvironment(config, database = "quickdata_dev") {
  const env = { ...process.env }
  // Make inherited secrets empty rather than absent, so Next's dotenv loader
  // cannot refill them from another developer configuration.
  const externalKey = /^(PAYSTACK_|NEXT_PUBLIC_PAYSTACK_|PROVIDER_|RESEND_|SMS_|HUBTEL_|TWILIO_|ARKESEL_)/
  for (const key of Object.keys(env)) if (externalKey.test(key)) env[key] = ""
  for (const key of ["PAYSTACK_SECRET_KEY", "PAYSTACK_SUBSCRIPTION_SECRET_KEY", "NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY", "PROVIDER_ORDER_URL", "PROVIDER_API_KEY", "RESEND_API_KEY", "RESEND_FROM_EMAIL"]) env[key] = ""
  return {
    ...env,
    DATABASE_URL: assertLocalDatabase(databaseUrl(config, database), database),
    NEXTAUTH_URL: `http://127.0.0.1:${appPort}`,
    APP_URL: `http://127.0.0.1:${appPort}`,
    NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${appPort}`,
    NEXTAUTH_SECRET: config.authSecret,
    AUTH_SECRET: config.authSecret,
    PAYMENT_SETTINGS_ENCRYPTION_KEY: config.encryptionKey,
    DISPATCH_MODE: "manual",
    NEXT_TELEMETRY_DISABLED: "1",
  }
}
