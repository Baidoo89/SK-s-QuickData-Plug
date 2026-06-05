CREATE TABLE IF NOT EXISTS "SubscriberStorefrontPrice" (
  "id" TEXT NOT NULL,
  "price" DOUBLE PRECISION NOT NULL,
  "productId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SubscriberStorefrontPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SubscriberStorefrontPrice_productId_organizationId_key" ON "SubscriberStorefrontPrice"("productId", "organizationId");
CREATE INDEX IF NOT EXISTS "SubscriberStorefrontPrice_organizationId_idx" ON "SubscriberStorefrontPrice"("organizationId");
