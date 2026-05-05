-- CreateEnum
CREATE TYPE "AdminActionType" AS ENUM ('USER_CREATED', 'VISITS_BALANCE_UPDATED', 'TARIFF_SOLD', 'USER_DEACTIVATED');

-- AlterTable
ALTER TABLE "visit_logs"
ADD COLUMN "guestCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "admin_action_logs" (
    "id" SERIAL NOT NULL,
    "adminId" INTEGER NOT NULL,
    "targetUserId" INTEGER,
    "action" "AdminActionType" NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_action_logs_adminId_createdAt_idx" ON "admin_action_logs"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "admin_action_logs_targetUserId_createdAt_idx" ON "admin_action_logs"("targetUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "admin_action_logs"
ADD CONSTRAINT "admin_action_logs_adminId_fkey"
FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_action_logs"
ADD CONSTRAINT "admin_action_logs_targetUserId_fkey"
FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
