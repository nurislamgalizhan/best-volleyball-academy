-- RegistrationAttempt: temporary storage for unverified registrations
-- Users are only created in the 'users' table AFTER phone verification
CREATE TABLE "registration_attempts" (
    "id" SERIAL NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "verificationCode" TEXT,
    "verificationCodeExpires" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "registration_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "registration_attempts_phone_key" ON "registration_attempts"("phone");
