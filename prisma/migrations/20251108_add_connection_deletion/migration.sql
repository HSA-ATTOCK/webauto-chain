-- CreateTable
CREATE TABLE "ConnectionDeletion" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectionDeletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConnectionDeletion_connectionId_key" ON "ConnectionDeletion"("connectionId");

-- AddForeignKey
ALTER TABLE "ConnectionDeletion"
  ADD CONSTRAINT "ConnectionDeletion_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "Connection"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectionDeletion"
  ADD CONSTRAINT "ConnectionDeletion_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
