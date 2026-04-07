-- Add server-side provider connection storage

CREATE TABLE IF NOT EXISTS "ProviderConnection" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "providerName" TEXT NOT NULL DEFAULT 'Primary Provider',
  "providerOrderUrl" TEXT,
  "providerApiKey" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderConnection_organizationId_key" ON "ProviderConnection"("organizationId");
CREATE INDEX IF NOT EXISTS "ProviderConnection_organizationId_idx" ON "ProviderConnection"("organizationId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProviderConnection_organizationId_fkey'
  ) THEN
    ALTER TABLE "ProviderConnection"
      ADD CONSTRAINT "ProviderConnection_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
