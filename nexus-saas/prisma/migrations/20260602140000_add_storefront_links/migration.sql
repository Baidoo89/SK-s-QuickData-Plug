CREATE TABLE "StorefrontLink" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "ownerType" TEXT NOT NULL DEFAULT 'SUBSCRIBER',
  "agentId" TEXT,
  "resellerId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StorefrontLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StorefrontLink_slug_key" ON "StorefrontLink"("slug");
CREATE INDEX "StorefrontLink_organizationId_idx" ON "StorefrontLink"("organizationId");
CREATE INDEX "StorefrontLink_ownerType_idx" ON "StorefrontLink"("ownerType");
CREATE INDEX "StorefrontLink_agentId_idx" ON "StorefrontLink"("agentId");
CREATE INDEX "StorefrontLink_resellerId_idx" ON "StorefrontLink"("resellerId");

ALTER TABLE "StorefrontLink"
  ADD CONSTRAINT "StorefrontLink_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
