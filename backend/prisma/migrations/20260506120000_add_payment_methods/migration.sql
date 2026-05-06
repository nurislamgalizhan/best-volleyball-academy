-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'KASPI', 'HALYK', 'MIXED');

-- CreateEnum
CREATE TYPE "CardProvider" AS ENUM ('KASPI', 'HALYK');

-- AlterTable
ALTER TABLE "sale_logs"
  ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
  ADD COLUMN "cashAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cardAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cardProvider" "CardProvider";

-- Backfill existing rows: legacy sales assumed cash
UPDATE "sale_logs" SET "cashAmount" = "pricePaid" WHERE "paymentMethod" = 'CASH';
