import { Prisma } from '@prisma/client';
import { prisma, txPrisma } from '../db/prisma.js';
import { Errors } from '../middleware/errors.js';
import { verifySecret } from '../auth/password.js';
import { requireLiveSession } from '../events/event.service.js';
import { assertChallengeAccessible } from '../challenges/challenge.service.js';
import { computeAwardedPoints, elapsedSecondsSince } from '../scoring/scoring.service.js';
import { broadcast, broadcastToTeam } from '../realtime/hub.js';
import { getTeamScore } from '../leaderboard/leaderboard.service.js';
import { validateInstanceAnswer, isFinalUnlocked } from '../challenges/challenge-instance.service.js';
import { recordTelemetry } from '../anticheat/anticheat.service.js';

export type SubmitOutcome =
  | { result: 'CORRECT'; awardedPoints: number; challengeId: string }
  | { result: 'INCORRECT' }
  | { result: 'DUPLICATE' };

export interface SubmitInput {
  userId: string;
  teamId: string;
  challengeId: string;
  flag: string;
  ip?: string;
}

/**
 * Full submission pipeline, scoped to the CURRENT LIVE session. Scoring uses the
 * session's startedAt; solves/submissions are tagged with sessionId; a team may
 * re-solve the same challenge in a later session (uniqueness is per session).
 */
export async function processSubmission(input: SubmitInput): Promise<SubmitOutcome> {
  const session = await requireLiveSession(); // rejects when no session is LIVE
  const sessionId = session.id;

  const challenge = await assertChallengeAccessible(sessionId, input.teamId, input.challengeId);

  const existing = await prisma.solve.findUnique({
    where: { sessionId_teamId_challengeId: { sessionId, teamId: input.teamId, challengeId: input.challengeId } },
  });
  if (existing) {
    await recordSubmission(sessionId, input, 'DUPLICATE', 0);
    throw Errors.alreadySolved();
  }

  // Multi-step gate: the final answer is only accepted once the intermediate
  // step has been verified server-side. A direct final submission that skips
  // the step machine is rejected (and recorded as a behavioral signal).
  if (!(await isFinalUnlocked(sessionId, input.teamId, input.challengeId))) {
    await recordSubmission(sessionId, input, 'REJECTED', 0);
    void recordTelemetry(input.userId, [{ type: 'STEP_SKIPPED_ATTEMPT' }]).catch(() => {});
    throw Errors.locked('Complete the intermediate step first');
  }

  // Server-authoritative validation. Prefer this team's per-session instance
  // (so Team A's answer never solves Team B); fall back to the legacy global
  // flag hash only for non-instanced challenges.
  const instanceVerdict = await validateInstanceAnswer(sessionId, input.teamId, input.challengeId, input.flag);
  const correct =
    instanceVerdict !== null ? instanceVerdict : await verifySecret(challenge.flagHash, input.flag);
  if (!correct) {
    await recordSubmission(sessionId, input, 'INCORRECT', 0);
    return { result: 'INCORRECT' };
  }

  const now = new Date();
  const elapsed = elapsedSecondsSince(session.startedAt, now);
  const awardedPoints = computeAwardedPoints(challenge.points, elapsed);

  try {
    await txPrisma.$transaction(async (tx) => {
      // Unique(sessionId, teamId, challengeId) → single award even under
      // simultaneous correct submissions from two teammates in this session.
      await tx.solve.create({
        data: {
          sessionId, teamId: input.teamId, challengeId: input.challengeId,
          solvedByUserId: input.userId, basePoints: challenge.points,
          awardedPoints, elapsedSeconds: elapsed, solvedAt: now,
        },
      });
      await tx.submission.create({
        data: {
          sessionId, teamId: input.teamId, userId: input.userId,
          challengeId: input.challengeId, result: 'CORRECT', awardedPoints, ip: input.ip,
        },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      await recordSubmission(sessionId, input, 'DUPLICATE', 0);
      throw Errors.alreadySolved();
    }
    throw e;
  }

  // Admin channel (all teams) — unchanged shape plus sessionId.
  broadcast({
    type: 'CHALLENGE_SOLVED',
    payload: { sessionId, teamId: input.teamId, challengeId: input.challengeId, awardedPoints, solvedByUserId: input.userId },
  });
  broadcast({ type: 'SCORE_UPDATED', payload: { sessionId, teamId: input.teamId } });
  broadcast({ type: 'LEADERBOARD_UPDATED', payload: { sessionId } });

  // Team channel — only this team's players, scoped to the current session.
  const teamScore = await getTeamScore(sessionId, input.teamId);
  broadcastToTeam(input.teamId, {
    type: 'TEAM_CHALLENGE_SOLVED',
    payload: { sessionId, challengeId: input.challengeId, scoreAwarded: awardedPoints, teamScore },
  });

  return { result: 'CORRECT', awardedPoints, challengeId: input.challengeId };
}

async function recordSubmission(
  sessionId: string,
  input: SubmitInput,
  result: 'CORRECT' | 'INCORRECT' | 'DUPLICATE' | 'REJECTED',
  awardedPoints: number,
): Promise<void> {
  await prisma.submission.create({
    data: {
      sessionId, teamId: input.teamId, userId: input.userId,
      challengeId: input.challengeId, result, awardedPoints, ip: input.ip,
    },
  });
}
