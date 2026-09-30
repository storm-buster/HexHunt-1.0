import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { Errors } from '../middleware/errors.js';
import { verifySecret } from '../auth/password.js';
import { requireEvent, assertLive } from '../events/event.service.js';
import { assertChallengeAccessible } from '../challenges/challenge.service.js';
import { computeAwardedPoints, elapsedSecondsSince } from '../scoring/scoring.service.js';
import { broadcast, broadcastToTeam } from '../realtime/hub.js';
import { getTeamScore } from '../leaderboard/leaderboard.service.js';

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
 * Full submission pipeline. The server is the sole authority for validity,
 * access, timing and scoring. Never reveals the correct answer.
 */
export async function processSubmission(input: SubmitInput): Promise<SubmitOutcome> {
  const event = await requireEvent();
  assertLive(event); // rejects before start / after close

  // Server-side access control (existence + unlock gating).
  const challenge = await assertChallengeAccessible(input.teamId, input.challengeId);

  // Already solved by the team? (fast path — also protected by unique index)
  const existing = await prisma.solve.findUnique({
    where: { teamId_challengeId: { teamId: input.teamId, challengeId: input.challengeId } },
  });
  if (existing) {
    await recordSubmission(event.id, input, 'DUPLICATE', 0);
    throw Errors.alreadySolved();
  }

  // Verify flag against stored argon2 hash.
  const correct = await verifySecret(challenge.flagHash, input.flag);
  if (!correct) {
    await recordSubmission(event.id, input, 'INCORRECT', 0);
    return { result: 'INCORRECT' };
  }

  const now = new Date();
  const elapsed = event.startedAt ? elapsedSecondsSince(event.startedAt, now) : 0;
  const awardedPoints = computeAwardedPoints(challenge.points, elapsed);

  try {
    await prisma.$transaction(async (tx) => {
      // Unique(teamId, challengeId) guarantees a single award even under
      // simultaneous correct submissions from two teammates.
      await tx.solve.create({
        data: {
          eventId: event.id,
          teamId: input.teamId,
          challengeId: input.challengeId,
          solvedByUserId: input.userId,
          basePoints: challenge.points,
          awardedPoints,
          elapsedSeconds: elapsed,
          solvedAt: now,
        },
      });
      await tx.submission.create({
        data: {
          eventId: event.id,
          teamId: input.teamId,
          userId: input.userId,
          challengeId: input.challengeId,
          result: 'CORRECT',
          awardedPoints,
          ip: input.ip,
        },
      });
    });
  } catch (e) {
    // Lost the race — another teammate solved it first. Award only once.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      await recordSubmission(event.id, input, 'DUPLICATE', 0);
      throw Errors.alreadySolved();
    }
    throw e;
  }

  // Admin channel (all teams) — unchanged.
  broadcast({
    type: 'CHALLENGE_SOLVED',
    payload: {
      teamId: input.teamId,
      challengeId: input.challengeId,
      awardedPoints,
      solvedByUserId: input.userId,
    },
  });
  broadcast({ type: 'SCORE_UPDATED', payload: { teamId: input.teamId } });
  broadcast({ type: 'LEADERBOARD_UPDATED' });

  // Team channel — notify only THIS team's connected players so their UI marks
  // the challenge solved without a reload. Emitted once, only for the actual
  // newly-created solve (the race loser threw ALREADY_SOLVED above). Carries the
  // authoritative team score; contains no flag/answer or other team's data.
  const teamScore = await getTeamScore(input.teamId);
  broadcastToTeam(input.teamId, {
    type: 'TEAM_CHALLENGE_SOLVED',
    payload: { challengeId: input.challengeId, scoreAwarded: awardedPoints, teamScore },
  });

  return { result: 'CORRECT', awardedPoints, challengeId: input.challengeId };
}

async function recordSubmission(
  eventId: string,
  input: SubmitInput,
  result: 'CORRECT' | 'INCORRECT' | 'DUPLICATE' | 'REJECTED',
  awardedPoints: number,
): Promise<void> {
  await prisma.submission.create({
    data: {
      eventId,
      teamId: input.teamId,
      userId: input.userId,
      challengeId: input.challengeId,
      result,
      awardedPoints,
      ip: input.ip,
    },
  });
}
