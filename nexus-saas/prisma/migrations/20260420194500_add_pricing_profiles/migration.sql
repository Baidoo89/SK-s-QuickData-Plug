-- CreateTable
CREATE TABLE "PricingProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT,
    "targetRole" TEXT NOT NULL DEFAULT 'BOTH',
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingProfileItem" (
    "id" TEXT NOT NULL,
    "pricingProfileId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingProfileItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPricingProfileAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pricingProfileId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPricingProfileAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PricingProfile_organizationId_name_key" ON "PricingProfile"("organizationId", "name");

-- CreateIndex
CREATE INDEX "PricingProfile_organizationId_idx" ON "PricingProfile"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PricingProfileItem_pricingProfileId_productId_key" ON "PricingProfileItem"("pricingProfileId", "productId");

-- CreateIndex
CREATE INDEX "PricingProfileItem_productId_idx" ON "PricingProfileItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPricingProfileAssignment_organizationId_userId_key" ON "UserPricingProfileAssignment"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPricingProfileAssignment_userId_key" ON "UserPricingProfileAssignment"("userId");

-- CreateIndex
CREATE INDEX "UserPricingProfileAssignment_pricingProfileId_idx" ON "UserPricingProfileAssignment"("pricingProfileId");

-- AddForeignKey
ALTER TABLE "PricingProfile" ADD CONSTRAINT "PricingProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingProfileItem" ADD CONSTRAINT "PricingProfileItem_pricingProfileId_fkey" FOREIGN KEY ("pricingProfileId") REFERENCES "PricingProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingProfileItem" ADD CONSTRAINT "PricingProfileItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPricingProfileAssignment" ADD CONSTRAINT "UserPricingProfileAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPricingProfileAssignment" ADD CONSTRAINT "UserPricingProfileAssignment_pricingProfileId_fkey" FOREIGN KEY ("pricingProfileId") REFERENCES "PricingProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPricingProfileAssignment" ADD CONSTRAINT "UserPricingProfileAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
