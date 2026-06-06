-- Keep the internal cuid() primary key, but add a readable public order code
-- for support, receipts, manual processing, exports, and external API responses.

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "publicOrderCode" TEXT;

WITH ordered AS (
  SELECT
    "id",
    'TD-' || to_char("createdAt", 'YYYYMMDD') || '-' ||
      lpad(row_number() OVER (PARTITION BY to_char("createdAt", 'YYYYMMDD') ORDER BY "createdAt", "id")::text, 6, '0') AS code
  FROM "Order"
  WHERE "publicOrderCode" IS NULL
)
UPDATE "Order" AS o
SET "publicOrderCode" = ordered.code
FROM ordered
WHERE o."id" = ordered."id";

CREATE UNIQUE INDEX IF NOT EXISTS "Order_publicOrderCode_key"
  ON "Order"("publicOrderCode");

CREATE INDEX IF NOT EXISTS "Order_publicOrderCode_idx"
  ON "Order"("publicOrderCode");

CREATE TABLE IF NOT EXISTS "OrderNumberCounter" (
  "id" TEXT NOT NULL,
  "dateKey" TEXT NOT NULL,
  "nextValue" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderNumberCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrderNumberCounter_dateKey_key"
  ON "OrderNumberCounter"("dateKey");

INSERT INTO "OrderNumberCounter" ("id", "dateKey", "nextValue", "createdAt", "updatedAt")
SELECT
  'order-counter-' || day_counts."dateKey",
  day_counts."dateKey",
  day_counts.count_value,
  NOW(),
  NOW()
FROM (
  SELECT to_char("createdAt", 'YYYYMMDD') AS "dateKey", COUNT(*)::integer AS count_value
  FROM "Order"
  GROUP BY to_char("createdAt", 'YYYYMMDD')
) AS day_counts
ON CONFLICT ("dateKey") DO UPDATE SET
  "nextValue" = GREATEST("OrderNumberCounter"."nextValue", EXCLUDED."nextValue"),
  "updatedAt" = NOW();
