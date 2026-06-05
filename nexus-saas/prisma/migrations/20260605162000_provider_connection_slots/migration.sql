-- Allow each organization to keep multiple provider API connections.
-- Existing single-provider records become the "primary" slot.

ALTER TABLE "ProviderConnection"
  ADD COLUMN IF NOT EXISTS "providerKey" TEXT;

UPDATE "ProviderConnection"
SET "providerKey" = 'primary'
WHERE "providerKey" IS NULL OR trim("providerKey") = '';

ALTER TABLE "ProviderConnection"
  ALTER COLUMN "providerKey" SET DEFAULT 'primary',
  ALTER COLUMN "providerKey" SET NOT NULL;

ALTER TABLE "ProviderConnection"
  ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 100;

DROP INDEX IF EXISTS "ProviderConnection_organizationId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderConnection_organizationId_providerKey_key"
  ON "ProviderConnection"("organizationId", "providerKey");

CREATE INDEX IF NOT EXISTS "ProviderConnection_providerKey_idx"
  ON "ProviderConnection"("providerKey");

CREATE INDEX IF NOT EXISTS "ProviderConnection_active_idx"
  ON "ProviderConnection"("active");
