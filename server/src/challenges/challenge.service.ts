import type { Challenge } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { Errors } from '../middleware/errors.js';
import { getOrCreateInstance, isInstanced, instancePublicState, isMultiStep, currentStepClue } from './challenge-instance.service.js';

// Player-safe challenge shape. NEVER includes flagHash / portalAnswerHash /
// any answer value.
export interface PlayerChallenge {
  id: string;
  title: string;
  category: string;
  universe: string;
  difficulty: string;
  description: string;
  narrative: string;
  hints: string[];
  portalType: string;
  portalPuzzle: unknown;
  clueContent: unknown | null;
  type: string;
  stone: string;
  points: number;
  author: string;
  nextChallengeId: string | null;
  orderIndex: number;
  universeOrder: number;
  locked: boolean;
  solved: boolean;
  // Multi-step challenges only: current phase info (final-phase material is
  // never present while awaitingIntermediate is true).
  step?: number;
  totalSteps?: number;
  awaitingIntermediate?: boolean;
}

export function toPlayerChallenge(
  c: Challenge,
  state: { locked: boolean; solved: boolean },
): PlayerChallenge {
  return {
    id: c.id, title: c.title, category: c.category, universe: c.universe,
    difficulty: c.difficulty, description: c.description, narrative: c.narrative,
    hints: (c.hints as string[]) ?? [], portalType: c.portalType, portalPuzzle: c.portalPuzzle,
    clueContent: c.clueContent ?? null, type: c.type, stone: c.stone, points: c.points,
    author: c.author, nextChallengeId: c.nextChallengeId, orderIndex: c.orderIndex,
    universeOrder: c.universeOrder, locked: state.locked, solved: state.solved,
  };
}

export async function getStandardChallenges(): Promise<Challenge[]> {
  return prisma.challenge.findMany({
    where: { isHidden: false },
    orderBy: [{ universeOrder: 'asc' }, { orderIndex: 'asc' }],
  });
}

// Challenges solved by a team IN A SPECIFIC SESSION.
async function getTeamSolvedIds(sessionId: string, teamId: string): Promise<Set<string>> {
  const solves = await prisma.solve.findMany({
    where: { sessionId, teamId },
    select: { challengeId: true },
  });
  return new Set(solves.map((s) => s.challengeId));
}

// Sequential gating (unchanged logic), computed per session's solved set.
export function computeUnlockMap(
  challenges: Challenge[],
  solved: Set<string>,
): Map<string, boolean> {
  const byUniverse = new Map<number, Challenge[]>();
  for (const c of challenges) {
    const arr = byUniverse.get(c.universeOrder) ?? [];
    arr.push(c);
    byUniverse.set(c.universeOrder, arr);
  }
  for (const arr of byUniverse.values()) arr.sort((a, b) => a.orderIndex - b.orderIndex);

  const universeOrders = Array.from(byUniverse.keys()).sort((a, b) => a - b);
  const unlockedUniverse = new Map<number, boolean>();
  for (let i = 0; i < universeOrders.length; i++) {
    const uo = universeOrders[i];
    if (i === 0) unlockedUniverse.set(uo, true);
    else {
      const prev = byUniverse.get(universeOrders[i - 1])!;
      unlockedUniverse.set(uo, prev.every((c) => solved.has(c.id)));
    }
  }

  const map = new Map<string, boolean>();
  for (const uo of universeOrders) {
    const arr = byUniverse.get(uo)!;
    const universeOpen = unlockedUniverse.get(uo)!;
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i];
      if (!universeOpen) { map.set(c.id, false); continue; }
      map.set(c.id, i === 0 ? true : solved.has(arr[i - 1].id));
    }
  }
  return map;
}

export async function getPlayerChallenges(sessionId: string, teamId: string): Promise<PlayerChallenge[]> {
  const challenges = await getStandardChallenges();
  const solved = await getTeamSolvedIds(sessionId, teamId);
  const unlock = computeUnlockMap(challenges, solved);
  return challenges.map((c) =>
    toPlayerChallenge(c, { locked: !unlock.get(c.id), solved: solved.has(c.id) }),
  );
}

export async function getPlayerChallenge(sessionId: string, teamId: string, id: string): Promise<PlayerChallenge> {
  const challenge = await prisma.challenge.findUnique({ where: { id } });
  if (!challenge || challenge.isHidden) throw Errors.notFound('Challenge not found');
  const challenges = await getStandardChallenges();
  const solved = await getTeamSolvedIds(sessionId, teamId);
  const unlock = computeUnlockMap(challenges, solved);
  if (!unlock.get(id)) throw Errors.locked();
  const player = toPlayerChallenge(challenge, { locked: false, solved: solved.has(id) });

  // Per-team instanced clue: the authoritative clue is generated server-side and
  // is unique to this session+team. The static Challenge.clueContent is only a
  // template; it is never the runtime clue for an instanced challenge.
  if (isInstanced(id)) {
    if (isMultiStep(id)) {
      // Multi-step: return ONLY the current phase's material (final-phase
      // material is withheld until the intermediate is verified).
      const view = await currentStepClue(sessionId, teamId, id);
      if (view) {
        player.clueContent = view.clueContent as unknown as PlayerChallenge['clueContent'];
        player.step = view.step;
        player.totalSteps = view.totalSteps;
        player.awaitingIntermediate = view.awaitingIntermediate;
      }
    } else {
      const inst = await getOrCreateInstance(sessionId, teamId, id);
      if (inst) player.clueContent = instancePublicState(inst).clueContent as unknown as PlayerChallenge['clueContent'];
    }
  }
  return player;
}

export async function assertChallengeAccessible(
  sessionId: string,
  teamId: string,
  id: string,
): Promise<Challenge> {
  const challenge = await prisma.challenge.findUnique({ where: { id } });
  if (!challenge || challenge.isHidden) throw Errors.notFound('Challenge not found');
  const challenges = await getStandardChallenges();
  const solved = await getTeamSolvedIds(sessionId, teamId);
  const unlock = computeUnlockMap(challenges, solved);
  if (!unlock.get(id)) throw Errors.locked();
  return challenge;
}

export async function getTeamProgress(sessionId: string, teamId: string): Promise<{
  solvedChallengeIds: string[];
  stones: string[];
  solvedCount: number;
  totalStandard: number;
}> {
  const standard = await getStandardChallenges();
  const solves = await prisma.solve.findMany({
    where: { sessionId, teamId },
    include: { challenge: { select: { stone: true, isHidden: true } } },
  });
  const stones = Array.from(
    new Set(solves.filter((s) => !s.challenge.isHidden).map((s) => s.challenge.stone)),
  );
  return {
    solvedChallengeIds: solves.map((s) => s.challengeId),
    stones,
    solvedCount: solves.filter((s) => !s.challenge.isHidden).length,
    totalStandard: standard.length,
  };
}
