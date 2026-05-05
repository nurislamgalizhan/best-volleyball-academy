-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'VISITOR');

-- CreateEnum
CREATE TYPE "TimeType" AS ENUM ('ANY', 'MORNING', 'EVENING');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VISITOR',
    "visitsBalance" INTEGER NOT NULL DEFAULT 0,
    "subscriptionEnd" TIMESTAMP(3),
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "verificationCode" TEXT,
    "verificationCodeExpires" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tariffs" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "visitsAmount" INTEGER,
    "durationDays" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "timeType" "TimeType" NOT NULL DEFAULT 'ANY',
    "timeStart" TEXT,
    "timeEnd" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tariffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_logs" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "visitsDeducted" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_logs" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tariffId" INTEGER NOT NULL,
    "pricePaid" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- AddForeignKey
ALTER TABLE "visit_logs" ADD CONSTRAINT "visit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_logs" ADD CONSTRAINT "sale_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_logs" ADD CONSTRAINT "sale_logs_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "tariffs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
