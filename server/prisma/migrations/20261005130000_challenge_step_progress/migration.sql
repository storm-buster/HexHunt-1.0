-- ============================================================
-- ChallengeStepProgress — multi-step state machine (server-only)
-- ------------------------------------------------------------
-- Purely ADDITIVE: one new table. No alter/drop/delete of existing objects.
-- Tracks a team's progression through server-validated phases of a multi-step
-- challenge. intermediateHash is a server-only argon2id hash; stepMaterial's
-- final phase is withheld from the player until the intermediate is verified.
-- FK to EventSession ON DELETE CASCADE → wiped on STOP/reset/cleanup.
-- ============================================================
CREATE TABLE "ChallengeStepProgress" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 1,
    "totalSteps" INTEGER NOT NULL DEFAULT 2,
    "intermediateHash" TEXT NOT NULL,
    "stepMaterial" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeStepProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChallengeStepProgress_sessionId_teamId_challengeId_key" ON "ChallengeStepProgress"("sessionId", "teamId", "challengeId");
CREATE INDEX "ChallengeStepProgress_sessionId_idx" ON "ChallengeStepProgress"("sessionId");
CREATE INDEX "ChallengeStepProgress_sessionId_teamId_idx" ON "ChallengeStepProgress"("sessionId", "teamId");

ALTER TABLE "ChallengeStepProgress" ADD CONSTRAINT "ChallengeStepProgress_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "EventSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
