import type { PrismaClient } from '@prisma/client';
import { hashPassword, hashSecret } from '../auth/password.js';
import { seedChallenges } from '../challenges/challenge-data.js';

// Config-free (no dotenv) so it is safe to call from the production bootstrap
// without accidentally loading the development .env. Idempotent: upserts only —
// never deletes users, teams, memberships, submissions, solves, or scores.

export interface SeedCoreOptions {
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  eventName: string;
}

export interface SeedCoreResult {
  adminEmail: string;
  eventCreated: boolean;
  challengeCount: number;
}

export async function seedCore(
  prisma: PrismaClient,
  opts: SeedCoreOptions,
): Promise<SeedCoreResult> {
  const adminEmail = opts.adminEmail.trim().toLowerCase();

  // Admin (upsert — sets/refreshes hash + role + active; does not touch others).
  const adminHash = await hashPassword(opts.adminPassword);
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN', name: opts.adminName, passwordHash: adminHash, active: true },
    create: { email: adminEmail, name: opts.adminName, passwordHash: adminHash, role: 'ADMIN' },
  });

  // Singleton event — create only if none exists (never duplicates).
  const existingEvent = await prisma.event.findFirst({ orderBy: { createdAt: 'desc' } });
  let eventCreated = false;
  if (!existingEvent) {
    await prisma.event.create({ data: { name: opts.eventName, status: 'NOT_STARTED' } });
    eventCreated = true;
  }

  // Challenges — upsert each by id (updates metadata/hashes; no deletions).
  for (const c of seedChallenges) {
    const flagHash = await hashSecret(c._flag);
    const portalAnswerHash = c._portalAnswer ? await hashSecret(c._portalAnswer) : null;
    await prisma.challenge.upsert({
      where: { id: c.id },
      update: {
        title: c.title, category: c.category, universe: c.universe, difficulty: c.difficulty,
        description: c.description, narrative: c.narrative, hints: c.hints, portalType: c.portalType,
        portalPuzzle: c.portalPuzzle, clueContent: c.clueContent ?? undefined, type: c.type,
        stone: c.stone, points: c.points, author: c.author, nextChallengeId: c.nextChallengeId,
        orderIndex: c.orderIndex, universeOrder: c.universeOrder, isHidden: c.isHidden,
        hiddenReward: c.hiddenReward ?? null, hiddenPenalty: c.hiddenPenalty ?? null,
        revealText: c.revealText ?? null, flagHash, portalAnswerHash,
      },
      create: {
        id: c.id, title: c.title, category: c.category, universe: c.universe, difficulty: c.difficulty,
        description: c.description, narrative: c.narrative, hints: c.hints, portalType: c.portalType,
        portalPuzzle: c.portalPuzzle, clueContent: c.clueContent ?? undefined, type: c.type,
        stone: c.stone, points: c.points, author: c.author, nextChallengeId: c.nextChallengeId,
        orderIndex: c.orderIndex, universeOrder: c.universeOrder, isHidden: c.isHidden,
        hiddenReward: c.hiddenReward ?? null, hiddenPenalty: c.hiddenPenalty ?? null,
        revealText: c.revealText ?? null, flagHash, portalAnswerHash,
      },
    });
  }

  return { adminEmail, eventCreated, challengeCount: seedChallenges.length };
}
