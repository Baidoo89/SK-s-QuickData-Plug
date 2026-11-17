CREATE TABLE "SubscriptionCheckout" (
 "reference" TEXT NOT NULL PRIMARY KEY,
 "organizationId" TEXT NOT NULL,
 "planId" TEXT NOT NULL,
 "createdByUserId" TEXT NOT NULL,
 "amountMinor" BIGINT NOT NULL CHECK ("amountMinor" > 0 AND "amountMinor" <= 9007199254740991),
 "currency" TEXT NOT NULL DEFAULT 'GHS',
 "status" TEXT NOT NULL DEFAULT 'PENDING',
 "paidAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "SubscriptionCheckout_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "SubscriptionCheckout_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SubscriptionCheckout_organizationId_idx" ON "SubscriptionCheckout"("organizationId");
CREATE INDEX "SubscriptionCheckout_planId_idx" ON "SubscriptionCheckout"("planId");
