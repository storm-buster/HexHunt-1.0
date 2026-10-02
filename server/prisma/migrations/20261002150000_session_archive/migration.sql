-- ============================================================
-- SessionArchive — immutable historical snapshot store
-- ------------------------------------------------------------
-- Purely ADDITIVE: creates one new table. Does NOT alter, drop, or delete any
-- existing table, column, or row. Safe to run against production.
--
-- Written once per session at STOP (before the live participant/gameplay tables
-- are wiped). Has NO foreign keys to live tables, so the live reset can never
-- cascade into or affect archived history.
-- ============================================================
CREATE TABLE "SessionArchive" (
    "id" TEXT NOT NULL,
    "sessionNumber" INTEGER NOT NULL,
    "eventName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "numberOfUsers" INTEGER NOT NULL,
    "numberOfTeams" INTEGER NOT NULL,
    "totalSolves" INTEGER NOT NULL,
    "totalSubmissions" INTEGER NOT NULL,
    "highestScore" INTEGER NOT NULL,
    "hiddenAttempts" INTEGER NOT NULL,
    "hiddenCorrect" INTEGER NOT NULL,
    "hiddenIncorrect" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionArchive_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionArchive_sessionNumber_key" ON "SessionArchive"("sessionNumber");
CREATE INDEX "SessionArchive_sessionNumber_idx" ON "SessionArchive"("sessionNumber");
