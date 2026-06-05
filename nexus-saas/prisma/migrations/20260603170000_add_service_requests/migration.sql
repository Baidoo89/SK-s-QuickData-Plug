CREATE TABLE "ServiceRequest" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "customerId" TEXT,
  "agentId" TEXT,
  "userId" TEXT,
  "type" TEXT NOT NULL DEFAULT 'AFA_REGISTRATION',
  "status" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
  "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "paymentReference" TEXT,
  "source" TEXT NOT NULL DEFAULT 'STOREFRONT',
  "sellerRole" TEXT,
  "sellerUserId" TEXT,
  "sellerAgentId" TEXT,
  "paymentOwner" TEXT NOT NULL DEFAULT 'STOREFRONT',
  "customerName" TEXT NOT NULL,
  "phoneNumber" TEXT NOT NULL,
  "location" TEXT,
  "dateOfBirth" TIMESTAMP(3),
  "details" TEXT,
  "total" DOUBLE PRECISION NOT NULL,
  "profit" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServiceRequest_organizationId_idx" ON "ServiceRequest"("organizationId");
CREATE INDEX "ServiceRequest_productId_idx" ON "ServiceRequest"("productId");
CREATE INDEX "ServiceRequest_customerId_idx" ON "ServiceRequest"("customerId");
CREATE INDEX "ServiceRequest_agentId_idx" ON "ServiceRequest"("agentId");
CREATE INDEX "ServiceRequest_userId_idx" ON "ServiceRequest"("userId");
CREATE INDEX "ServiceRequest_type_idx" ON "ServiceRequest"("type");
CREATE INDEX "ServiceRequest_status_idx" ON "ServiceRequest"("status");
CREATE INDEX "ServiceRequest_paymentStatus_idx" ON "ServiceRequest"("paymentStatus");
CREATE INDEX "ServiceRequest_paymentReference_idx" ON "ServiceRequest"("paymentReference");
CREATE INDEX "ServiceRequest_sellerRole_idx" ON "ServiceRequest"("sellerRole");
CREATE INDEX "ServiceRequest_sellerUserId_idx" ON "ServiceRequest"("sellerUserId");
CREATE INDEX "ServiceRequest_sellerAgentId_idx" ON "ServiceRequest"("sellerAgentId");
