-- Provider templates describe how a provider API accepts orders.
-- Provider product mappings let each subscriber map their local bundles to
-- provider package codes without affecting any other subscriber.

CREATE TABLE IF NOT EXISTS "ProviderTemplate" (
  "id" TEXT NOT NULL,
  "templateKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "authType" TEXT NOT NULL DEFAULT 'BEARER',
  "authHeader" TEXT NOT NULL DEFAULT 'Authorization',
  "authPrefix" TEXT,
  "requestTemplate" TEXT,
  "statusPath" TEXT NOT NULL DEFAULT 'status',
  "referencePath" TEXT NOT NULL DEFAULT 'reference',
  "messagePath" TEXT NOT NULL DEFAULT 'message',
  "statusMap" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderTemplate_templateKey_key"
  ON "ProviderTemplate"("templateKey");

CREATE INDEX IF NOT EXISTS "ProviderTemplate_active_idx"
  ON "ProviderTemplate"("active");

INSERT INTO "ProviderTemplate" (
  "id",
  "templateKey",
  "name",
  "description",
  "authType",
  "authHeader",
  "authPrefix",
  "requestTemplate",
  "statusPath",
  "referencePath",
  "messagePath",
  "statusMap",
  "active",
  "createdAt",
  "updatedAt"
)
VALUES (
  'provider-template-generic-json',
  'generic-json',
  'Generic JSON Provider',
  'Default order payload used for providers that accept the Techdalt standard JSON format.',
  'BEARER',
  'Authorization',
  'Bearer',
  '{"orderId":"{{orderId}}","productId":"{{productId}}","externalProductCode":"{{externalProductCode}}","network":"{{network}}","phone":"{{phone}}","quantity":{{quantity}},"amount":{{amount}}}',
  'status',
  'reference',
  'message',
  '{"completed":["COMPLETED","SUCCESS","SUCCESSFUL","DELIVERED"],"failed":["FAILED","FAIL","REJECTED","CANCELLED","CANCELED"],"pending":["PENDING","PROCESSING","QUEUED","ACCEPTED"]}',
  true,
  NOW(),
  NOW()
)
ON CONFLICT ("templateKey") DO NOTHING;

ALTER TABLE "ProviderConnection"
  ADD COLUMN IF NOT EXISTS "templateKey" TEXT NOT NULL DEFAULT 'generic-json',
  ADD COLUMN IF NOT EXISTS "settings" TEXT;

CREATE INDEX IF NOT EXISTS "ProviderConnection_templateKey_idx"
  ON "ProviderConnection"("templateKey");

CREATE TABLE IF NOT EXISTS "ProviderProductMapping" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "providerKey" TEXT NOT NULL DEFAULT 'primary',
  "productId" TEXT NOT NULL,
  "externalProductCode" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderProductMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderProductMapping_org_provider_product_key"
  ON "ProviderProductMapping"("organizationId", "providerKey", "productId");

CREATE INDEX IF NOT EXISTS "ProviderProductMapping_organizationId_idx"
  ON "ProviderProductMapping"("organizationId");

CREATE INDEX IF NOT EXISTS "ProviderProductMapping_providerKey_idx"
  ON "ProviderProductMapping"("providerKey");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProviderProductMapping_organizationId_fkey'
  ) THEN
    ALTER TABLE "ProviderProductMapping"
      ADD CONSTRAINT "ProviderProductMapping_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProviderProductMapping_productId_fkey'
  ) THEN
    ALTER TABLE "ProviderProductMapping"
      ADD CONSTRAINT "ProviderProductMapping_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
