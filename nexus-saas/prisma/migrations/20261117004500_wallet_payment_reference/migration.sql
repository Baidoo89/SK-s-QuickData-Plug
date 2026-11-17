ALTER TABLE "WalletTransaction" ADD COLUMN "paymentReference" TEXT;
CREATE UNIQUE INDEX "WalletTransaction_paymentReference_key" ON "WalletTransaction"("paymentReference");
