ALTER TABLE "ApiKey"
ADD COLUMN "ownerType" TEXT NOT NULL DEFAULT 'SUBSCRIBER',
ADD COLUMN "ownerUserId" TEXT,
ADD COLUMN "ownerAgentId" TEXT;

CREATE INDEX "ApiKey_ownerType_idx" ON "ApiKey"("ownerType");
CREATE INDEX "ApiKey_ownerUserId_idx" ON "ApiKey"("ownerUserId");
CREATE INDEX "ApiKey_ownerAgentId_idx" ON "ApiKey"("ownerAgentId");
