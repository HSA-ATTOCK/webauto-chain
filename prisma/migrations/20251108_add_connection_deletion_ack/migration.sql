-- AlterTable
ALTER TABLE "ConnectionDeletion"
  ADD COLUMN "acknowledgedById" TEXT,
  ADD COLUMN "acknowledgedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "ConnectionDeletion"
  ADD CONSTRAINT "ConnectionDeletion_acknowledgedById_fkey"
  FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
