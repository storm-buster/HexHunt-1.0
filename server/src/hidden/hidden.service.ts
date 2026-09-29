import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { config } from '../config/index.js';
import { Errors } from '../middleware/errors.js';
import { verifySecret } from '../auth/password.js';
import { requireEvent, assertLive, refreshHiddenActivation } from '../events/event.service.js';
import { broadcast } from '../realtime/hub.js';

export const HIDDEN_CHALLENGE_ID = 'hidden-01';

export interface HiddenStateView {
  activated: boolean;      // global: has the hidden level activated (T+30)?
  available: boolean;      // member-specific: is THIS user the selected operative?
  challenge: {
    id: string;
    title: string;
    category: string;
    description: string;
    narrative: string;
    clueContent: unknown | null;
    hints: string[];
    reward: number;
    penalty: number;
  } | null;
  attempted: boolean;      // team-wide: has the team used its one attempt?
  result: { correct: boolean; scoreDelta: number; submittedAt: Date } | null;
  warning: string | null;
}

async function getAssignment(teamId: string, eventId: string) {
  return prisma.hiddenLevelAssignment.findUnique({
    where: { teamId_eventId: { teamId, eventId } },
  });
}

export async function getHiddenState(userId: string, teamId: string): Promise<HiddenStateView> {
  const event = await refreshHiddenActivation();
  const empty: HiddenStateView = {
    activated: false, available: false, challenge: null, attempted: false, result: null, warning: null,
  };

  // Before activation the hidden level is completely invisible to everyone.
  if (!event.hiddenActivated) return empty;

  const [assignment, result] = await Promise.all([
    getAssignment(teamId, event.id),
    prisma.hiddenLevelResult.findUnique({ where: { teamId } }),
  ]);

  const available = !!assignment && assignment.selectedUserId === userId;
  const attempted = !!result;
  const resultView = result
    ? { correct: result.correct, scoreDelta: result.scoreDelta, submittedAt: result.submittedAt }
    : null;

  // Non-selected members: know an anomaly occurred but get NO access/metadata.
  if (!available) {
    return { activated: true, available: false, challenge: null, attempted, result: resultView, warning: null };
  }

  const hidden = await prisma.challenge.findUnique({ where: { id: HIDDEN_CHALLENGE_ID } });
  const reward = hidden?.hiddenReward ?? config.hidden.reward;
  const penalty = hidden?.hiddenPenalty ?? config.hidden.penalty;

  return {
    activated: true,
    available: true,
    challenge: hidden
      ? {
          id: hidden.id,
          title: hidden.title,
          category: hidden.category,
          description: hidden.description,
          narrative: hidden.narrative,
          clueContent: hidden.clueContent ?? null,
          hints: (hidden.hints as string[]) ?? [],
          reward,
          penalty,
        }
      : null,
    attempted,
    result: resultView,
    warning: `HIDDEN LEVEL — Correct: +${reward} points. Incorrect: -${penalty} points. One attempt per team.`,
  };
}

export interface HiddenSubmitOutcome {
  correct: boolean;
  scoreDelta: number;
}

export async function submitHidden(
  userId: string,
  teamId: string,
  answer: string,
): Promise<HiddenSubmitOutcome> {
  const event = await requireEvent();
  assertLive(event);

  const refreshed = await refreshHiddenActivation();
  if (!refreshed.hiddenActivated) throw Errors.forbidden('Hidden level is not active');

  // Member-specific gate: only the selected operative may submit.
  const assignment = await getAssignment(teamId, event.id);
  if (!assignment) throw Errors.forbidden('Your team has no hidden-level assignment');
  if (assignment.selectedUserId !== userId) {
    throw Errors.forbidden('You are not the selected operative for the hidden level');
  }

  // One attempt per team.
  const existing = await prisma.hiddenLevelResult.findUnique({ where: { teamId } });
  if (existing) throw Errors.conflict('Your team has already attempted the hidden level');

  const hidden = await prisma.challenge.findUnique({ where: { id: HIDDEN_CHALLENGE_ID } });
  if (!hidden) throw Errors.notFound('Hidden challenge not found');

  const reward = hidden.hiddenReward ?? config.hidden.reward;
  const penalty = hidden.hiddenPenalty ?? config.hidden.penalty;

  const correct = await verifySecret(hidden.flagHash, answer);
  const scoreDelta = correct ? reward : -penalty;

  try {
    await prisma.hiddenLevelResult.create({
      data: { eventId: event.id, teamId, submittedByUserId: userId, correct, scoreDelta },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw Errors.conflict('Your team has already attempted the hidden level');
    }
    throw e;
  }

  broadcast({ type: 'HIDDEN_LEVEL_RESULT', payload: { teamId, correct, scoreDelta, submittedByUserId: userId } });
  broadcast({ type: 'SCORE_UPDATED', payload: { teamId } });
  broadcast({ type: 'LEADERBOARD_UPDATED' });

  return { correct, scoreDelta };
}
