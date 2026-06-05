ALTER TABLE "Order"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'DASHBOARD_BUY',
ADD COLUMN "sellerRole" TEXT,
ADD COLUMN "sellerUserId" TEXT,
ADD COLUMN "sellerAgentId" TEXT,
ADD COLUMN "customerType" TEXT NOT NULL DEFAULT 'DASHBOARD_USER',
ADD COLUMN "paymentOwner" TEXT NOT NULL DEFAULT 'WALLET',
ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'PAID',
ADD COLUMN "fulfillmentMode" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "externalReference" TEXT;

UPDATE "Order" o
SET
  "source" = 'STOREFRONT',
  "customerType" = 'PUBLIC_CUSTOMER',
  "paymentOwner" = 'STOREFRONT',
  "paymentStatus" = CASE
    WHEN o."status" = 'PENDING_PAYMENT' THEN 'PENDING'
    WHEN o."status" = 'PAYMENT_FAILED' THEN 'FAILED'
    ELSE 'PAID'
  END
WHERE EXISTS (
  SELECT 1
  FROM "AuditLog" a
  WHERE a."targetType" = 'ORDER'
    AND a."targetId" = o."id"
    AND a."action" = 'STOREFRONT_CHECKOUT_CREATED'
);

UPDATE "Order" o
SET
  "source" = 'API',
  "customerType" = 'API_CUSTOMER',
  "paymentOwner" = 'EXTERNAL',
  "paymentStatus" = 'PAID',
  "externalReference" = substring(a."meta" from '"externalReference"\s*:\s*"([^"]+)"')
FROM "AuditLog" a
WHERE a."targetType" = 'ORDER'
  AND a."targetId" = o."id"
  AND a."action" = 'API_ORDER_CREATED';

UPDATE "Order" o
SET
  "sellerRole" = CASE
    WHEN o."source" = 'API' THEN 'SUBSCRIBER'
    WHEN o."source" = 'STOREFRONT' AND o."userId" IS NOT NULL AND u."role" = 'RESELLER' THEN 'RESELLER'
    WHEN o."source" = 'STOREFRONT' AND o."agentId" IS NOT NULL THEN 'AGENT'
    WHEN u."role" IN ('AGENT', 'RESELLER', 'SUBSCRIBER') THEN u."role"
    WHEN o."agentId" IS NOT NULL THEN 'AGENT'
    ELSE 'SUBSCRIBER'
  END,
  "sellerUserId" = o."userId",
  "sellerAgentId" = o."agentId"
FROM "User" u
WHERE o."userId" = u."id";

UPDATE "Order"
SET
  "sellerRole" = CASE
    WHEN "source" = 'API' THEN 'SUBSCRIBER'
    WHEN "source" = 'STOREFRONT' AND "agentId" IS NOT NULL THEN 'AGENT'
    ELSE COALESCE("sellerRole", 'SUBSCRIBER')
  END,
  "sellerAgentId" = COALESCE("sellerAgentId", "agentId")
WHERE "sellerRole" IS NULL;

CREATE INDEX "Order_source_idx" ON "Order"("source");
CREATE INDEX "Order_sellerRole_idx" ON "Order"("sellerRole");
CREATE INDEX "Order_sellerUserId_idx" ON "Order"("sellerUserId");
CREATE INDEX "Order_sellerAgentId_idx" ON "Order"("sellerAgentId");
CREATE INDEX "Order_paymentStatus_idx" ON "Order"("paymentStatus");
CREATE INDEX "Order_fulfillmentMode_idx" ON "Order"("fulfillmentMode");
CREATE INDEX "Order_externalReference_idx" ON "Order"("externalReference");
