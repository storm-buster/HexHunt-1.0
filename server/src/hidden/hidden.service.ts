import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { config } from '../config/index.js';
import { Errors } from '../middleware/errors.js';
import { verifySecret } from '../auth/password.js';
import { requireLiveSession, refreshHiddenActivation } from '../events/event.service.js';
import { broadcast } from '../realtime/hub.js';

export const HIDDEN_CHALLENGE_ID = 'hidden-01';

export interface HiddenStateView {
  activated: boolean;
  available: boolean;
  challenge: {
    id: string; title: string; category: string; description: string;
    narrative: string; clueContent: unknown | null; hints: string[];
    reward: number; penalty: number;
  } | null;
  attempted: boolean;
  result: { correct: boolean; scoreDelta: number; submittedAt: Date } | null;
  warning: string | null;
}

const EMPTY: HiddenStateView = {
  activated: false, available: false, challenge: null, attempted: false, result: null, warning: null,
};

export async function getHiddenState(userId: string, teamId: string): Promise<HiddenStateView> {
  const session = await refreshHiddenActivation(); // current LIVE session or null
  if (!session || !session.hiddenActivated) return EMPTY;

  const [assignment, result] = await Promise.all([
    prisma.hiddenLevelAssignment.findUnique({ where: { sessionId_teamId: { sessionId: session.id, teamId } } }),
    prisma.hiddenLevelResult.findUnique({ where: { sessionId_teamId: { sessionId: session.id, teamId } } }),
  ]);

  const available = !!assignment && assignment.selectedUserId === userId;
  const attempted = !!result;
  const resultView = result
    ? { correct: result.correct, scoreDelta: result.scoreDelta, submittedAt: result.submittedAt }
    : null;

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
          id: hidden.id, title: hidden.title, category: hidden.category,
          description: hidden.description, narrative: hidden.narrative,
          clueContent: hidden.clueContent ?? null, hints: (hidden.hints as string[]) ?? [],
          reward, penalty,
        }
      : null,
    attempted,
    result: resultView,
    warning: `HIDDEN LEVEL — Correct: +${reward} points. Incorrect: -${penalty} points. One attempt per team.`,
  };
}

export interface HiddenSubmitOutcome { correct: boolean; scoreDelta: number; }

export async function submitHidden(userId: string, teamId: string, answer: string): Promise<HiddenSubmitOutcome> {
  const session = await requireLiveSession();
  if (!session.hiddenActivated) {
    // Trigger activation if the scheduled time has just passed, then re-check.
    const refreshed = await refreshHiddenActivation();
    if (!refreshed || !refreshed.hiddenActivated) throw Errors.forbidden('Hidden level is not active');
  }
  const sessionId = session.id;

  const assignment = await prisma.hiddenLevelAssignment.findUnique({
    where: { sessionId_teamId: { sessionId, teamId } },
  });
  if (!assignment) throw Errors.forbidden('Your team has no hidden-level assignment');
  if (assignment.selectedUserId !== userId) {
    throw Errors.forbidden('You are not the selected operative for the hidden level');
  }

  const existing = await prisma.hiddenLevelResult.findUnique({ where: { sessionId_teamId: { sessionId, teamId } } });
  if (existing) throw Errors.conflict('Your team has already attempted the hidden level');

  const hidden = await prisma.challenge.findUnique({ where: { id: HIDDEN_CHALLENGE_ID } });
  if (!hidden) throw Errors.notFound('Hidden challenge not found');
  const reward = hidden.hiddenReward ?? config.hidden.reward;
  const penalty = hidden.hiddenPenalty ?? config.hidden.penalty;

  const correct = await verifySecret(hidden.flagHash, answer);
  const scoreDelta = correct ? reward : -penalty;

  try {
    await prisma.hiddenLevelResult.create({
      data: { sessionId, teamId, submittedByUserId: userId, correct, scoreDelta },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw Errors.conflict('Your team has already attempted the hidden level');
    }
    throw e;
  }

  broadcast({ type: 'HIDDEN_LEVEL_RESULT', payload: { sessionId, teamId, correct, scoreDelta, submittedByUserId: userId } });
  broadcast({ type: 'SCORE_UPDATED', payload: { sessionId, teamId } });
  broadcast({ type: 'LEADERBOARD_UPDATED', payload: { sessionId } });

  return { correct, scoreDelta };
}
