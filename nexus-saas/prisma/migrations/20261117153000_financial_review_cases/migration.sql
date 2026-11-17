CREATE TABLE "FinancialReviewCase" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "caseKey" TEXT NOT NULL,
 "organizationId" TEXT,
 "kind" TEXT NOT NULL,
 "targetType" TEXT NOT NULL,
 "targetId" TEXT NOT NULL,
 "reference" TEXT,
 "reason" TEXT NOT NULL,
 "sourceAuditId" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN','REVIEWED')),
 "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
 "reviewNote" TEXT,
 "reviewedByUserId" TEXT,
 "reviewedByName" TEXT,
 "reviewedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "FinancialReviewCase_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FinancialReviewCase_caseKey_key" ON "FinancialReviewCase"("caseKey");
CREATE INDEX "FinancialReviewCase_organizationId_status_createdAt_idx" ON "FinancialReviewCase"("organizationId","status","createdAt");
CREATE INDEX "FinancialReviewCase_kind_targetId_idx" ON "FinancialReviewCase"("kind","targetId");
