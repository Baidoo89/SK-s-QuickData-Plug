-- Catch-up migration for environments where drift exists.
-- This migration is intentionally defensive so it can run safely.

-- 1) User table catch-up columns
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "agentId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "parentAgentId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;

-- 2) WalletTransaction table (missing from earlier migration history)
CREATE TABLE IF NOT EXISTS "WalletTransaction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "performedByEmail" TEXT,
  "performedByRole" TEXT,
  "method" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'success',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WalletTransaction_userId_idx" ON "WalletTransaction"("userId");

-- 3) ResellerPrice table for reseller-specific overrides
CREATE TABLE IF NOT EXISTS "ResellerPrice" (
  "id" TEXT NOT NULL,
  "price" DOUBLE PRECISION NOT NULL,
  "resellerId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResellerPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ResellerPrice_resellerId_productId_key" ON "ResellerPrice"("resellerId", "productId");
CREATE INDEX IF NOT EXISTS "ResellerPrice_resellerId_idx" ON "ResellerPrice"("resellerId");

-- 4) Unique index on User.agentId (required by schema)
CREATE UNIQUE INDEX IF NOT EXISTS "User_agentId_key" ON "User"("agentId");

-- 5) Add foreign keys only if they do not already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_agentId_fkey'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_agentId_fkey"
      FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_parentAgentId_fkey'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_parentAgentId_fkey"
      FOREIGN KEY ("parentAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WalletTransaction_userId_fkey'
  ) THEN
    ALTER TABLE "WalletTransaction"
      ADD CONSTRAINT "WalletTransaction_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ResellerPrice_resellerId_fkey'
  ) THEN
    ALTER TABLE "ResellerPrice"
      ADD CONSTRAINT "ResellerPrice_resellerId_fkey"
      FOREIGN KEY ("resellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ResellerPrice_productId_fkey'
  ) THEN
    ALTER TABLE "ResellerPrice"
      ADD CONSTRAINT "ResellerPrice_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ResellerPrice_organizationId_fkey'
  ) THEN
    ALTER TABLE "ResellerPrice"
      ADD CONSTRAINT "ResellerPrice_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;
