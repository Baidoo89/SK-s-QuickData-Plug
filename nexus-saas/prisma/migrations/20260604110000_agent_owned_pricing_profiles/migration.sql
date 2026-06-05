ALTER TABLE "PricingProfile" ADD COLUMN IF NOT EXISTS "ownerAgentId" TEXT;
DROP INDEX IF EXISTS "PricingProfile_organizationId_name_key";
CREATE INDEX IF NOT EXISTS "PricingProfile_ownerAgentId_idx" ON "PricingProfile"("ownerAgentId");
