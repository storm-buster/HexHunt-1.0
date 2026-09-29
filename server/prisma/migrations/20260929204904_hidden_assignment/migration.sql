-- CreateTable
CREATE TABLE "HiddenLevelAssignment" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "selectedUserId" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HiddenLevelAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HiddenLevelAssignment_eventId_idx" ON "HiddenLevelAssignment"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "HiddenLevelAssignment_teamId_eventId_key" ON "HiddenLevelAssignment"("teamId", "eventId");

-- AddForeignKey
ALTER TABLE "HiddenLevelAssignment" ADD CONSTRAINT "HiddenLevelAssignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiddenLevelAssignment" ADD CONSTRAINT "HiddenLevelAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiddenLevelAssignment" ADD CONSTRAINT "HiddenLevelAssignment_selectedUserId_fkey" FOREIGN KEY ("selectedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
