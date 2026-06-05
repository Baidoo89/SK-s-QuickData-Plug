CREATE TABLE "StorefrontPayment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "orderIds" TEXT NOT NULL,
  "metadata" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StorefrontPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StorefrontPayment_reference_key" ON "StorefrontPayment"("reference");
CREATE INDEX "StorefrontPayment_organizationId_idx" ON "StorefrontPayment"("organizationId");
CREATE INDEX "StorefrontPayment_status_idx" ON "StorefrontPayment"("status");
