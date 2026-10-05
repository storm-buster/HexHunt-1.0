import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  makeApp, resetState, registerPlayer, createTeam, startEventAsAdmin, stopEventAsAdmin, prisma,
} from './helpers.js';
import { prisma as pooledClient, txPrisma } from '../src/db/prisma.js';
import { config } from '../src/config/index.js';
import { solveChallenge } from './instance-helpers.js';

const WV01 = 'DOOM{a3f19c2b}';

let app: FastifyInstance;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetState(); });

describe('transaction-client architecture (pooled vs direct)', () => {
  it('A. pooled client serves normal single-statement queries', async () => {
    const n = await pooledClient.user.count({ where: { role: 'ADMIN' } });
    expect(n).toBeGreaterThanOrEqual(1); // seeded admin
    // helpers.prisma is the same shared pooled client.
    expect(prisma).toBe(pooledClient);
  });

  it('config: directDatabaseUrl is defined and (in test) targets the test DB', async () => {
    expect(config.directDatabaseUrl).toBeTruthy();
    // In test mode the direct URL equals the pooled test URL (localhost = direct).
    expect(config.directDatabaseUrl).toBe(config.databaseUrl);
    // Not the dev database.
    expect(config.databaseUrl).toContain('doomsday_ctf_test');
  });

  it('B. direct tx client runs an interactive transaction and commits', async () => {
    await startEventAsAdmin(app);
    const owner = await registerPlayer(app, 'TxOwner', 'tx-owner@x.com');
    // createTeam / joinTeam / solve all route through txPrisma.$transaction.
    const code = await createTeam(app, owner, 'Tx Team');
    expect(code).toBeTruthy();
    const mate = await registerPlayer(app, 'TxMate', 'tx-mate@x.com');
    const joined = await app.inject({ method: 'POST', url: '/api/teams/join', headers: { cookie: mate }, payload: { inviteCode: code } });
    expect(joined.statusCode).toBe(200);
    const solve = await solveChallenge(app, owner, 'wv-01');
    expect(solve.statusCode).toBe(200);
    expect(await prisma.solve.count()).toBe(1);
  });

  it('E. STOP archive+wipe is atomic (archive persisted, live state wiped)', async () => {
    await startEventAsAdmin(app);
    const p = await registerPlayer(app, 'Atom', 'atom@x.com');
    await createTeam(app, p, 'Atoms');
    await solveChallenge(app, p, 'wv-01');
    await stopEventAsAdmin(app);
    expect(await prisma.sessionArchive.count()).toBe(1);
    expect(await prisma.user.count({ where: { role: 'PLAYER' } })).toBe(0);
    expect(await prisma.solve.count()).toBe(0);
  });

  it('F. rollback: an error after archive-create but before commit persists NOTHING', async () => {
    // Seed some live state we expect to survive a failed (rolled-back) transaction.
    await startEventAsAdmin(app);
    const p = await registerPlayer(app, 'Keep', 'keep-tx@x.com');
    await createTeam(app, p, 'Keepers Tx');
    const playersBefore = await prisma.user.count({ where: { role: 'PLAYER' } });
    const teamsBefore = await prisma.team.count();
    const archivesBefore = await prisma.sessionArchive.count();
    const live = await prisma.eventSession.findFirst({ where: { status: 'LIVE' } });

    // Mimic stopSession's tx shape (archive then wipe) but throw before commit.
    await expect(
      txPrisma.$transaction(async (tx) => {
        await tx.sessionArchive.create({
          data: {
            sessionNumber: 9999, eventName: 'ROLLBACK TEST',
            startedAt: live!.startedAt, completedAt: new Date(), durationSeconds: 1,
            numberOfUsers: 0, numberOfTeams: 0, totalSolves: 0, totalSubmissions: 0,
            highestScore: 0, hiddenAttempts: 0, hiddenCorrect: 0, hiddenIncorrect: 0,
            data: {},
          },
        });
        await tx.user.deleteMany({ where: { role: 'PLAYER' } }); // "wipe"
        throw new Error('forced failure before commit');
      }),
    ).rejects.toThrow(/forced failure/);

    // Everything rolled back: archive not persisted, players/teams intact.
    expect(await prisma.sessionArchive.count()).toBe(archivesBefore);
    expect(await prisma.sessionArchive.findUnique({ where: { sessionNumber: 9999 } })).toBeNull();
    expect(await prisma.user.count({ where: { role: 'PLAYER' } })).toBe(playersBefore);
    expect(await prisma.team.count()).toBe(teamsBefore);
  });

  it('G. cleanup rollback: a failed wipe transaction deletes nothing', async () => {
    await startEventAsAdmin(app);
    const p = await registerPlayer(app, 'CU', 'cleanup-tx@x.com');
    await createTeam(app, p, 'Cleanup Tx');
    const playersBefore = await prisma.user.count({ where: { role: 'PLAYER' } });
    const teamsBefore = await prisma.team.count();

    await expect(
      txPrisma.$transaction(async (tx) => {
        await tx.teamMembership.deleteMany({});
        await tx.team.deleteMany({});
        await tx.user.deleteMany({ where: { role: 'PLAYER' } });
        throw new Error('forced cleanup failure');
      }),
    ).rejects.toThrow(/forced cleanup failure/);

    expect(await prisma.user.count({ where: { role: 'PLAYER' } })).toBe(playersBefore);
    expect(await prisma.team.count()).toBe(teamsBefore);
  });

  it('H. no stray connection/secret: tx client reuses the pooled client when no separate direct URL', async () => {
    // In test/non-pooled environments directDatabaseUrl === databaseUrl, so we
    // must NOT have spun up a second client (and thus no second connection/URL).
    expect(config.directDatabaseUrl).toBe(config.databaseUrl);
    expect(txPrisma).toBe(pooledClient);
    // And the test never points at a production pooler host.
    expect(config.directDatabaseUrl).not.toContain('pooler');
    expect(config.directDatabaseUrl).not.toContain('neon.tech');
  });
});
