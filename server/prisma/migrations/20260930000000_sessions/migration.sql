-- ============================================================
-- Session-based lifecycle rework
-- ------------------------------------------------------------
-- Introduces EventSession and scopes all gameplay to a session.
-- DISCARDS prior gameplay data (solves, submissions, hidden-level attempts) —
-- these cannot be meaningfully backfilled onto sessions. PRESERVES users,
-- teams, memberships, challenge definitions, and the Event container.
-- ============================================================

-- 1) Drop old (event-scoped) gameplay tables. Data intentionally discarded.
DROP TABLE "HiddenLevelAssignment";
DROP TABLE "HiddenLevelResult";
DROP TABLE "Submission";
DROP TABLE "Solve";

-- 2) Event becomes a plain persistent container.
ALTER TABLE "Event" DROP COLUMN "status";
ALTER TABLE "Event" DROP COLUMN "startedAt";
ALTER TABLE "Event" DROP COLUMN "closedAt";
ALTER TABLE "Event" DROP COLUMN "hiddenActivationAt";
ALTER TABLE "Event" DROP COLUMN "hiddenActivated";

-- 3) Replace the lifecycle enum.
DROP TYPE "EventStatus";
CREATE TYPE "SessionStatus" AS ENUM ('LIVE', 'COMPLETED');

-- 4) EventSession — one START→STOP run.
CREATE TABLE "EventSession" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sessionNumber" INTEGER NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'LIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "hiddenActivationAt" TIMESTAMP(3),
    "hiddenActivated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EventSession_eventId_sessionNumber_key" ON "EventSession"("eventId", "sessionNumber");
CREATE INDEX "EventSession_eventId_idx" ON "EventSession"("eventId");
CREATE INDEX "EventSession_status_idx" ON "EventSession"("status");
-- Exactly one LIVE session per event (partial unique — not expressible in the
-- Prisma schema, so it is defined here by hand).
CREATE UNIQUE INDEX "EventSession_one_live_per_event" ON "EventSession"("eventId") WHERE "status" = 'LIVE';
ALTER TABLE "EventSession" ADD CONSTRAINT "EventSession_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5) Solve — one per team per challenge PER SESSION.
CREATE TABLE "Solve" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "solvedByUserId" TEXT NOT NULL,
    "solvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "basePoints" INTEGER NOT NULL,
    "awardedPoints" INTEGER NOT NULL,
    "elapsedSeconds" INTEGER NOT NULL,

    CONSTRAINT "Solve_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Solve_sessionId_idx" ON "Solve"("sessionId");
CREATE INDEX "Solve_teamId_idx" ON "Solve"("teamId");
CREATE INDEX "Solve_challengeId_idx" ON "Solve"("challengeId");
CREATE INDEX "Solve_sessionId_teamId_idx" ON "Solve"("sessionId", "teamId");
CREATE UNIQUE INDEX "Solve_sessionId_teamId_challengeId_key" ON "Solve"("sessionId", "teamId", "challengeId");
ALTER TABLE "Solve" ADD CONSTRAINT "Solve_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "EventSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Solve" ADD CONSTRAINT "Solve_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Solve" ADD CONSTRAINT "Solve_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6) Submission — audit log per session.
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "result" "SubmissionResult" NOT NULL,
    "awardedPoints" INTEGER NOT NULL DEFAULT 0,
    "penaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Submission_sessionId_idx" ON "Submission"("sessionId");
CREATE INDEX "Submission_teamId_idx" ON "Submission"("teamId");
CREATE INDEX "Submission_challengeId_idx" ON "Submission"("challengeId");
CREATE INDEX "Submission_submittedAt_idx" ON "Submission"("submittedAt");
CREATE INDEX "Submission_sessionId_teamId_idx" ON "Submission"("sessionId", "teamId");
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "EventSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7) HiddenLevelResult — one attempt per team PER SESSION.
CREATE TABLE "HiddenLevelResult" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "submittedByUserId" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "scoreDelta" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HiddenLevelResult_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HiddenLevelResult_sessionId_teamId_key" ON "HiddenLevelResult"("sessionId", "teamId");
CREATE INDEX "HiddenLevelResult_sessionId_idx" ON "HiddenLevelResult"("sessionId");
ALTER TABLE "HiddenLevelResult" ADD CONSTRAINT "HiddenLevelResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "EventSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HiddenLevelResult" ADD CONSTRAINT "HiddenLevelResult_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HiddenLevelResult" ADD CONSTRAINT "HiddenLevelResult_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 8) HiddenLevelAssignment — per-team selected member PER SESSION.
CREATE TABLE "HiddenLevelAssignment" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "selectedUserId" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HiddenLevelAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HiddenLevelAssignment_sessionId_teamId_key" ON "HiddenLevelAssignment"("sessionId", "teamId");
CREATE INDEX "HiddenLevelAssignment_sessionId_idx" ON "HiddenLevelAssignment"("sessionId");
ALTER TABLE "HiddenLevelAssignment" ADD CONSTRAINT "HiddenLevelAssignment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "EventSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HiddenLevelAssignment" ADD CONSTRAINT "HiddenLevelAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HiddenLevelAssignment" ADD CONSTRAINT "HiddenLevelAssignment_selectedUserId_fkey" FOREIGN KEY ("selectedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
