import type { Challenge } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { Errors } from '../middleware/errors.js';

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
  portalPuzzle: unknown; // sanitized (no answer)
  clueContent: unknown | null; // sanitized (no flag)
  type: string;
  stone: string;
  points: number;
  author: string;
  nextChallengeId: string | null;
  orderIndex: number;
  universeOrder: number;
  locked: boolean;
  solved: boolean;
}

export function toPlayerChallenge(
  c: Challenge,
  state: { locked: boolean; solved: boolean },
): PlayerChallenge {
  return {
    id: c.id,
    title: c.title,
    category: c.category,
    universe: c.universe,
    difficulty: c.difficulty,
    description: c.description,
    narrative: c.narrative,
    hints: (c.hints as string[]) ?? [],
    portalType: c.portalType,
    portalPuzzle: c.portalPuzzle,
    clueContent: c.clueContent ?? null,
    type: c.type,
    stone: c.stone,
    points: c.points,
    author: c.author,
    nextChallengeId: c.nextChallengeId,
    orderIndex: c.orderIndex,
    universeOrder: c.universeOrder,
    locked: state.locked,
    solved: state.solved,
  };
}

// Ordered, non-hidden challenges.
export async function getStandardChallenges(): Promise<Challenge[]> {
  return prisma.challenge.findMany({
    where: { isHidden: false },
    orderBy: [{ universeOrder: 'asc' }, { orderIndex: 'asc' }],
  });
}

async function getTeamSolvedIds(teamId: string): Promise<Set<string>> {
  const solves = await prisma.solve.findMany({
    where: { teamId },
    select: { challengeId: true },
  });
  return new Set(solves.map((s) => s.challengeId));
}

/**
 * Server-authoritative gating (mirrors the intended sequential progression):
 *  - Universe 0 (webverse) is always available.
 *  - A later universe unlocks when EVERY challenge of the previous universe is
 *    solved by the team.
 *  - Within a universe, the first challenge is available once the universe is
 *    unlocked; each subsequent challenge unlocks when the previous one (by
 *    orderIndex) is solved by the team.
 *
 * Never trusts client state / localStorage / URL.
 */
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
    if (i === 0) {
      unlockedUniverse.set(uo, true);
    } else {
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
      if (!universeOpen) {
        map.set(c.id, false);
        continue;
      }
      if (i === 0) {
        map.set(c.id, true);
      } else {
        map.set(c.id, solved.has(arr[i - 1].id));
      }
    }
  }
  return map;
}

export async function getPlayerChallenges(teamId: string): Promise<PlayerChallenge[]> {
  const challenges = await getStandardChallenges();
  const solved = await getTeamSolvedIds(teamId);
  const unlock = computeUnlockMap(challenges, solved);
  return challenges.map((c) =>
    toPlayerChallenge(c, { locked: !unlock.get(c.id), solved: solved.has(c.id) }),
  );
}

export async function getPlayerChallenge(teamId: string, id: string): Promise<PlayerChallenge> {
  const challenge = await prisma.challenge.findUnique({ where: { id } });
  if (!challenge || challenge.isHidden) throw Errors.notFound('Challenge not found');

  const challenges = await getStandardChallenges();
  const solved = await getTeamSolvedIds(teamId);
  const unlock = computeUnlockMap(challenges, solved);
  const locked = !unlock.get(id);
  if (locked) throw Errors.locked();

  return toPlayerChallenge(challenge, { locked: false, solved: solved.has(id) });
}

// Used by the submission pipeline — returns the challenge only if the team is
// allowed to access it right now (unsolved handled by caller).
export async function assertChallengeAccessible(
  teamId: string,
  id: string,
): Promise<Challenge> {
  const challenge = await prisma.challenge.findUnique({ where: { id } });
  if (!challenge || challenge.isHidden) throw Errors.notFound('Challenge not found');
  const challenges = await getStandardChallenges();
  const solved = await getTeamSolvedIds(teamId);
  const unlock = computeUnlockMap(challenges, solved);
  if (!unlock.get(id)) throw Errors.locked();
  return challenge;
}

export async function getTeamProgress(teamId: string): Promise<{
  solvedChallengeIds: string[];
  stones: string[];
  solvedCount: number;
  totalStandard: number;
}> {
  const standard = await getStandardChallenges();
  const solves = await prisma.solve.findMany({
    where: { teamId },
    include: { challenge: { select: { stone: true, isHidden: true } } },
  });
  const solvedChallengeIds = solves.map((s) => s.challengeId);
  const stones = Array.from(
    new Set(solves.filter((s) => !s.challenge.isHidden).map((s) => s.challenge.stone)),
  );
  return {
    solvedChallengeIds,
    stones,
    solvedCount: solves.filter((s) => !s.challenge.isHidden).length,
    totalStandard: standard.length,
  };
}
