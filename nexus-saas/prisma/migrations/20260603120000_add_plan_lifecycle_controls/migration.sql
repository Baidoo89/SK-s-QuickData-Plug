ALTER TABLE "Plan"
ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "visible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "recommended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "retiredAt" TIMESTAMP(3);

UPDATE "Plan"
SET "recommended" = true
WHERE "id" = (
  SELECT "id"
  FROM "Plan"
  ORDER BY "priceGHS" ASC, "createdAt" ASC
  OFFSET 1
  LIMIT 1
);
