ALTER TYPE "AdminActionType" ADD VALUE IF NOT EXISTS 'SALE_UPDATED';
ALTER TYPE "AdminActionType" ADD VALUE IF NOT EXISTS 'SALE_REFUNDED';

CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REFUNDED', 'CANCELLED');
CREATE TYPE "SaleStatus" AS ENUM ('ACTIVE', 'REFUNDED');

CREATE TABLE "sections" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sections_name_key" ON "sections"("name");

INSERT INTO "sections" ("name", "sortOrder")
VALUES ('Тренажерный зал', 0)
ON CONFLICT ("name") DO NOTHING;

ALTER TABLE "tariffs" ADD COLUMN "sectionId" INTEGER;

UPDATE "tariffs"
SET "sectionId" = (SELECT "id" FROM "sections" WHERE "name" = 'Тренажерный зал' LIMIT 1)
WHERE "sectionId" IS NULL;

UPDATE "tariffs" SET "name" = 'Дневной — 8 посещений' WHERE "name" = 'Утренний — 8 посещений';
UPDATE "tariffs" SET "name" = 'Дневной — 12 посещений' WHERE "name" = 'Утренний — 12 посещений';

ALTER TABLE "tariffs" ALTER COLUMN "sectionId" SET NOT NULL;
CREATE INDEX "tariffs_sectionId_isActive_idx" ON "tariffs"("sectionId", "isActive");
ALTER TABLE "tariffs"
  ADD CONSTRAINT "tariffs_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_logs"
  ADD COLUMN "sectionId" INTEGER,
  ADD COLUMN "status" "SaleStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "refundAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "refundedAt" TIMESTAMP(3),
  ADD COLUMN "editedAt" TIMESTAMP(3);

UPDATE "sale_logs"
SET "sectionId" = (SELECT "id" FROM "sections" WHERE "name" = 'Тренажерный зал' LIMIT 1)
WHERE "sectionId" IS NULL;

ALTER TABLE "sale_logs" ALTER COLUMN "sectionId" SET NOT NULL;
CREATE INDEX "sale_logs_sectionId_createdAt_idx" ON "sale_logs"("sectionId", "createdAt");
CREATE INDEX "sale_logs_status_idx" ON "sale_logs"("status");
ALTER TABLE "sale_logs"
  ADD CONSTRAINT "sale_logs_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "user_subscriptions" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "sectionId" INTEGER NOT NULL,
  "tariffId" INTEGER NOT NULL,
  "saleLogId" INTEGER,
  "visitsBalance" INTEGER NOT NULL DEFAULT 0,
  "subscriptionEnd" TIMESTAMP(3) NOT NULL,
  "frozenUntil" TIMESTAMP(3),
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_subscriptions_saleLogId_key" ON "user_subscriptions"("saleLogId");
CREATE INDEX "user_subscriptions_userId_status_idx" ON "user_subscriptions"("userId", "status");
CREATE INDEX "user_subscriptions_sectionId_status_idx" ON "user_subscriptions"("sectionId", "status");
CREATE INDEX "user_subscriptions_subscriptionEnd_status_idx" ON "user_subscriptions"("subscriptionEnd", "status");

WITH default_section AS (
  SELECT "id" FROM "sections" WHERE "name" = 'Тренажерный зал' LIMIT 1
),
fallback_tariff AS (
  SELECT "id" FROM "tariffs"
  WHERE "sectionId" = (SELECT "id" FROM default_section)
  ORDER BY "id" ASC
  LIMIT 1
),
latest_sales AS (
  SELECT DISTINCT ON ("userId") "id", "userId", "tariffId", "createdAt"
  FROM "sale_logs"
  ORDER BY "userId", "createdAt" DESC, "id" DESC
)
INSERT INTO "user_subscriptions" (
  "userId",
  "sectionId",
  "tariffId",
  "saleLogId",
  "visitsBalance",
  "subscriptionEnd",
  "frozenUntil",
  "status",
  "createdAt",
  "updatedAt"
)
SELECT
  u."id",
  (SELECT "id" FROM default_section),
  COALESCE(ls."tariffId", (SELECT "id" FROM fallback_tariff)),
  ls."id",
  CASE WHEN u."subscriptionEnd" <= CURRENT_TIMESTAMP THEN 0 ELSE u."visitsBalance" END,
  u."subscriptionEnd",
  u."frozenUntil",
  CASE WHEN u."subscriptionEnd" <= CURRENT_TIMESTAMP THEN 'EXPIRED'::"SubscriptionStatus" ELSE 'ACTIVE'::"SubscriptionStatus" END,
  COALESCE(ls."createdAt", u."updatedAt", CURRENT_TIMESTAMP),
  CURRENT_TIMESTAMP
FROM "users" u
LEFT JOIN latest_sales ls ON ls."userId" = u."id"
WHERE u."subscriptionEnd" IS NOT NULL
  AND COALESCE(ls."tariffId", (SELECT "id" FROM fallback_tariff)) IS NOT NULL;

CREATE UNIQUE INDEX "user_subscriptions_one_active_per_section_idx"
  ON "user_subscriptions"("userId", "sectionId")
  WHERE "status" = 'ACTIVE';

ALTER TABLE "user_subscriptions"
  ADD CONSTRAINT "user_subscriptions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_subscriptions"
  ADD CONSTRAINT "user_subscriptions_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_subscriptions"
  ADD CONSTRAINT "user_subscriptions_tariffId_fkey"
  FOREIGN KEY ("tariffId") REFERENCES "tariffs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_subscriptions"
  ADD CONSTRAINT "user_subscriptions_saleLogId_fkey"
  FOREIGN KEY ("saleLogId") REFERENCES "sale_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "visit_logs"
  ADD COLUMN "sectionId" INTEGER,
  ADD COLUMN "userSubscriptionId" INTEGER;

UPDATE "visit_logs"
SET "sectionId" = (SELECT "id" FROM "sections" WHERE "name" = 'Тренажерный зал' LIMIT 1)
WHERE "sectionId" IS NULL;

UPDATE "visit_logs" vl
SET "userSubscriptionId" = us."id"
FROM "user_subscriptions" us
WHERE us."userId" = vl."userId"
  AND us."sectionId" = vl."sectionId"
  AND vl."userSubscriptionId" IS NULL;

ALTER TABLE "visit_logs" ALTER COLUMN "sectionId" SET NOT NULL;
CREATE INDEX "visit_logs_sectionId_createdAt_idx" ON "visit_logs"("sectionId", "createdAt");
CREATE INDEX "visit_logs_userSubscriptionId_idx" ON "visit_logs"("userSubscriptionId");
ALTER TABLE "visit_logs"
  ADD CONSTRAINT "visit_logs_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "visit_logs"
  ADD CONSTRAINT "visit_logs_userSubscriptionId_fkey"
  FOREIGN KEY ("userSubscriptionId") REFERENCES "user_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
