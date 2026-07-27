ALTER TYPE "AdminActionType" ADD VALUE IF NOT EXISTS 'USER_DELETED';
ALTER TYPE "AdminActionType" ADD VALUE IF NOT EXISTS 'CLIENT_NOTE_CREATED';
ALTER TYPE "AdminActionType" ADD VALUE IF NOT EXISTS 'CLIENT_NOTE_UPDATED';
ALTER TYPE "AdminActionType" ADD VALUE IF NOT EXISTS 'CLIENT_NOTE_DELETED';

CREATE TABLE "client_notes" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "authorId" INTEGER,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "client_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "client_notes_userId_createdAt_idx" ON "client_notes"("userId", "createdAt");
CREATE INDEX "client_notes_authorId_idx" ON "client_notes"("authorId");

ALTER TABLE "client_notes"
  ADD CONSTRAINT "client_notes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "client_notes"
  ADD CONSTRAINT "client_notes_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
