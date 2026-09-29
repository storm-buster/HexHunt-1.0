import { prisma } from '../db/prisma.js';
import { getTeamProgress } from '../challenges/challenge.service.js';

export const FINAL_BOSS_ID = 'final-boss';
export const REQUIRED_STONES = 6;

export interface FinalBossView {
  unlocked: boolean;
  stones: string[];
  stoneCount: number;
  requiredStones: number;
  // Reveal text is returned ONLY when the team has satisfied the server-side
  // completion check. It is never present in the client bundle.
  reveal: string | null;
  participantName: string | null;
}

export async function getFinalBoss(
  teamId: string,
  userName: string,
): Promise<FinalBossView> {
  const progress = await getTeamProgress(teamId);
  const stoneCount = progress.stones.length;
  const unlocked = stoneCount >= REQUIRED_STONES;

  let reveal: string | null = null;
  if (unlocked) {
    const boss = await prisma.challenge.findUnique({ where: { id: FINAL_BOSS_ID } });
    reveal = boss?.revealText ?? null;
  }

  return {
    unlocked,
    stones: progress.stones,
    stoneCount,
    requiredStones: REQUIRED_STONES,
    reveal,
    participantName: userName,
  };
}
