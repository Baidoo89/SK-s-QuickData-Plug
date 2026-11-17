ALTER TABLE "Order" ADD COLUMN "apiKeyId" TEXT;
CREATE UNIQUE INDEX "Order_apiKeyId_externalReference_key" ON "Order"("apiKeyId", "externalReference");
