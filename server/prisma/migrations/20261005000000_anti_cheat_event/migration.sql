-- ============================================================
-- AntiCheatEvent — coarse, session-scoped behavioral telemetry
-- ------------------------------------------------------------
-- Purely ADDITIVE: one new table. No alter/drop/delete of existing objects.
-- Stores COUNTS per (session, team, user, event type) only — never clipboard
-- contents, answers, flags, or secrets. FK to EventSession ON DELETE CASCADE,
-- so rows are wiped automatically when a session is deleted (STOP/reset/cleanup).
-- ============================================================
CREATE TABLE "AntiCheatEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AntiCheatEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AntiCheatEvent_sessionId_teamId_userId_type_key" ON "AntiCheatEvent"("sessionId", "teamId", "userId", "type");
CREATE INDEX "AntiCheatEvent_sessionId_idx" ON "AntiCheatEvent"("sessionId");
CREATE INDEX "AntiCheatEvent_sessionId_teamId_idx" ON "AntiCheatEvent"("sessionId", "teamId");

ALTER TABLE "AntiCheatEvent" ADD CONSTRAINT "AntiCheatEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "EventSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
