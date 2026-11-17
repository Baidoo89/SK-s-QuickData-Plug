ALTER TABLE "WalletTransaction" ADD COLUMN "refundOfTransactionId" TEXT;
CREATE UNIQUE INDEX "WalletTransaction_refundOfTransactionId_key" ON "WalletTransaction"("refundOfTransactionId");
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_refundOfTransactionId_fkey" FOREIGN KEY ("refundOfTransactionId") REFERENCES "WalletTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
