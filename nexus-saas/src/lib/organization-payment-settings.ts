import crypto from "crypto"
import { db } from "@/lib/db"

type PaymentSettingsRow = {
  id: string
  organizationId: string
  paystackPublicKey: string | null
  paystackSecretKeyEnc: string | null
  paystackConnected: boolean
  updatedAt: Date | string
}

export type OrganizationPaymentSettings = {
  paystackPublicKey: string | null
  paystackSecretKey: string | null
  paystackConnected: boolean
  updatedAt: Date | string | null
}

function getEncryptionKey() {
  const source =
    process.env.PAYMENT_SETTINGS_ENCRYPTION_KEY ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    "development-only-payment-settings-key"

  return crypto.createHash("sha256").update(source).digest()
}

function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`
}

function decryptSecret(value: string | null) {
  if (!value) return null

  try {
    const [ivRaw, tagRaw, encryptedRaw] = value.split(":")
    if (!ivRaw || !tagRaw || !encryptedRaw) return null

    const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivRaw, "base64"))
    decipher.setAuthTag(Buffer.from(tagRaw, "base64"))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64")),
      decipher.final(),
    ])
    return decrypted.toString("utf8")
  } catch {
    return null
  }
}

export async function getStoredOrganizationPaymentSettings(organizationId: string) {
  const rows = await db.$queryRaw<PaymentSettingsRow[]>`
    SELECT
      "id",
      "organizationId",
      "paystackPublicKey",
      "paystackSecretKeyEnc",
      "paystackConnected",
      "updatedAt"
    FROM "OrganizationPaymentSettings"
    WHERE "organizationId" = ${organizationId}
    LIMIT 1
  `

  return rows[0] ?? null
}

export async function getOrganizationPaymentSettings(organizationId: string): Promise<OrganizationPaymentSettings> {
  const row = await getStoredOrganizationPaymentSettings(organizationId)

  return {
    paystackPublicKey: row?.paystackPublicKey ?? null,
    paystackSecretKey: decryptSecret(row?.paystackSecretKeyEnc ?? null),
    paystackConnected: Boolean(row?.paystackConnected && row.paystackPublicKey && row.paystackSecretKeyEnc),
    updatedAt: row?.updatedAt ?? null,
  }
}

export async function upsertOrganizationPaymentSettings(input: {
  organizationId: string
  paystackPublicKey: string
  paystackSecretKey: string | null
  updatedById: string
}) {
  const encryptedSecret = input.paystackSecretKey ? encryptSecret(input.paystackSecretKey) : null
  const existing = await getStoredOrganizationPaymentSettings(input.organizationId)
  const connected = Boolean(input.paystackPublicKey && (encryptedSecret || existing?.paystackSecretKeyEnc))

  await db.$executeRaw`
    INSERT INTO "OrganizationPaymentSettings" (
      "id",
      "organizationId",
      "paystackPublicKey",
      "paystackSecretKeyEnc",
      "paystackConnected",
      "updatedById",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${crypto.randomUUID()},
      ${input.organizationId},
      ${input.paystackPublicKey},
      ${encryptedSecret},
      ${connected},
      ${input.updatedById},
      NOW(),
      NOW()
    )
    ON CONFLICT ("organizationId") DO UPDATE SET
      "paystackPublicKey" = EXCLUDED."paystackPublicKey",
      "paystackSecretKeyEnc" = COALESCE(EXCLUDED."paystackSecretKeyEnc", "OrganizationPaymentSettings"."paystackSecretKeyEnc"),
      "paystackConnected" = EXCLUDED."paystackConnected",
      "updatedById" = EXCLUDED."updatedById",
      "updatedAt" = NOW()
  `

  return getOrganizationPaymentSettings(input.organizationId)
}
