-- ============================================================
-- ChallengeInstance — per-session, per-team challenge state
-- ------------------------------------------------------------
-- Purely ADDITIVE: one new table. No alter/drop/delete of existing objects.
-- publicState holds only non-secret player-visible material; answerHash is the
-- server-only argon2id hash of the per-instance answer. FK to EventSession
-- ON DELETE CASCADE → instances are wiped when a session is deleted
-- (STOP/reset/cleanup). Unique per (session, team, challenge).
-- ============================================================
CREATE TABLE "ChallengeInstance" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "publicState" JSONB NOT NULL,
    "answerHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeInstance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChallengeInstance_sessionId_teamId_challengeId_key" ON "ChallengeInstance"("sessionId", "teamId", "challengeId");
CREATE INDEX "ChallengeInstance_sessionId_idx" ON "ChallengeInstance"("sessionId");
CREATE INDEX "ChallengeInstance_sessionId_teamId_idx" ON "ChallengeInstance"("sessionId", "teamId");
CREATE INDEX "ChallengeInstance_challengeId_idx" ON "ChallengeInstance"("challengeId");

ALTER TABLE "ChallengeInstance" ADD CONSTRAINT "ChallengeInstance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "EventSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
