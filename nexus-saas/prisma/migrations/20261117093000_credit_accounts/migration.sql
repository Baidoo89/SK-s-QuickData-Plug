CREATE TABLE "CreditAccount" (
 "userId" TEXT NOT NULL PRIMARY KEY,
 "organizationId" TEXT NOT NULL,
 "enabled" BOOLEAN NOT NULL DEFAULT false,
 "limitMinor" BIGINT NOT NULL DEFAULT 0 CHECK ("limitMinor" >= 0 AND "limitMinor" <= 9007199254740991),
 "dueAt" TIMESTAMP(3),
 "approvedByUserId" TEXT NOT NULL,
 "note" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "CreditAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "CreditAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "CreditAccount_organizationId_idx" ON "CreditAccount"("organizationId");
