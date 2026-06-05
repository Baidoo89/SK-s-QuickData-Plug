CREATE TABLE "AgentStorefrontPrice" (
  "id" TEXT NOT NULL,
  "price" DOUBLE PRECISION NOT NULL,
  "agentId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgentStorefrontPrice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResellerStorefrontPrice" (
  "id" TEXT NOT NULL,
  "price" DOUBLE PRECISION NOT NULL,
  "resellerId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ResellerStorefrontPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentStorefrontPrice_agentId_productId_key" ON "AgentStorefrontPrice"("agentId", "productId");
CREATE INDEX "AgentStorefrontPrice_agentId_idx" ON "AgentStorefrontPrice"("agentId");
CREATE INDEX "AgentStorefrontPrice_organizationId_idx" ON "AgentStorefrontPrice"("organizationId");

CREATE UNIQUE INDEX "ResellerStorefrontPrice_resellerId_productId_key" ON "ResellerStorefrontPrice"("resellerId", "productId");
CREATE INDEX "ResellerStorefrontPrice_resellerId_idx" ON "ResellerStorefrontPrice"("resellerId");
CREATE INDEX "ResellerStorefrontPrice_organizationId_idx" ON "ResellerStorefrontPrice"("organizationId");
