import { PrismaClient } from '@prisma/client';
import { config } from '../src/config/index.js';
import { hashPassword, hashSecret } from '../src/auth/password.js';
import { seedChallenges } from './challenge-data.js';

const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });

async function main(): Promise<void> {
  console.log('Seeding database:', config.databaseUrl.replace(/:[^:@/]+@/, ':****@'));

  // ── Admin (credentials from environment only) ─────────────
  const adminEmail = config.admin.email.trim().toLowerCase();
  if (!adminEmail || !config.admin.password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set to seed the admin account');
  }
  if (config.isProd && config.admin.password === 'ChangeMe_Admin123!') {
    throw new Error('Refusing to seed the insecure default admin password in production — set a strong ADMIN_PASSWORD');
  }
  const adminHash = await hashPassword(config.admin.password);
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN', name: config.admin.name, passwordHash: adminHash, active: true },
    create: { email: adminEmail, name: config.admin.name, passwordHash: adminHash, role: 'ADMIN' },
  });
  console.log(`✓ Admin user ready: ${adminEmail}`);

  // ── Singleton event ───────────────────────────────────────
  const existingEvent = await prisma.event.findFirst({ orderBy: { createdAt: 'desc' } });
  if (!existingEvent) {
    await prisma.event.create({ data: { name: config.eventName, status: 'NOT_STARTED' } });
    console.log(`✓ Event created: ${config.eventName}`);
  } else {
    console.log(`✓ Event already exists: ${existingEvent.name} (${existingEvent.status})`);
  }

  // ── Challenges (flags/answers hashed, player content sanitized) ──
  for (const c of seedChallenges) {
    const flagHash = await hashSecret(c._flag);
    const portalAnswerHash = c._portalAnswer ? await hashSecret(c._portalAnswer) : null;

    await prisma.challenge.upsert({
      where: { id: c.id },
      update: {
        title: c.title,
        category: c.category,
        universe: c.universe,
        difficulty: c.difficulty,
        description: c.description,
        narrative: c.narrative,
        hints: c.hints,
        portalType: c.portalType,
        portalPuzzle: c.portalPuzzle,
        clueContent: c.clueContent ?? undefined,
        type: c.type,
        stone: c.stone,
        points: c.points,
        author: c.author,
        nextChallengeId: c.nextChallengeId,
        orderIndex: c.orderIndex,
        universeOrder: c.universeOrder,
        isHidden: c.isHidden,
        hiddenReward: c.hiddenReward ?? null,
        hiddenPenalty: c.hiddenPenalty ?? null,
        revealText: c.revealText ?? null,
        flagHash,
        portalAnswerHash,
      },
      create: {
        id: c.id,
        title: c.title,
        category: c.category,
        universe: c.universe,
        difficulty: c.difficulty,
        description: c.description,
        narrative: c.narrative,
        hints: c.hints,
        portalType: c.portalType,
        portalPuzzle: c.portalPuzzle,
        clueContent: c.clueContent ?? undefined,
        type: c.type,
        stone: c.stone,
        points: c.points,
        author: c.author,
        nextChallengeId: c.nextChallengeId,
        orderIndex: c.orderIndex,
        universeOrder: c.universeOrder,
        isHidden: c.isHidden,
        hiddenReward: c.hiddenReward ?? null,
        hiddenPenalty: c.hiddenPenalty ?? null,
        revealText: c.revealText ?? null,
        flagHash,
        portalAnswerHash,
      },
    });
  }
  console.log(`✓ Seeded ${seedChallenges.length} challenges (12 standard + hidden + final-boss)`);
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
