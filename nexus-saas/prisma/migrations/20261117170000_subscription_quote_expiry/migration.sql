ALTER TABLE "SubscriptionCheckout" ADD COLUMN "expiresAt" TIMESTAMP(3);
UPDATE "SubscriptionCheckout" SET "expiresAt" = "createdAt" + INTERVAL '30 minutes' WHERE "expiresAt" IS NULL;
ALTER TABLE "SubscriptionCheckout" ALTER COLUMN "expiresAt" SET NOT NULL;
CREATE INDEX "SubscriptionCheckout_status_expiresAt_idx" ON "SubscriptionCheckout"("status", "expiresAt");
