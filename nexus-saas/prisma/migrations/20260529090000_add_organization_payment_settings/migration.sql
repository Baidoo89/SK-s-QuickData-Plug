CREATE TABLE IF NOT EXISTS "OrganizationPaymentSettings" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "paystackPublicKey" TEXT,
  "paystackSecretKeyEnc" TEXT,
  "paystackConnected" BOOLEAN NOT NULL DEFAULT false,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationPaymentSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationPaymentSettings_organizationId_key" ON "OrganizationPaymentSettings"("organizationId");
CREATE INDEX IF NOT EXISTS "OrganizationPaymentSettings_organizationId_idx" ON "OrganizationPaymentSettings"("organizationId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrganizationPaymentSettings_organizationId_fkey'
  ) THEN
    ALTER TABLE "OrganizationPaymentSettings"
      ADD CONSTRAINT "OrganizationPaymentSettings_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
