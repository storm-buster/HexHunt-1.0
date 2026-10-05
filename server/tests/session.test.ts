import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import JSZip from 'jszip';
import {
  makeApp, resetState, registerPlayer, createTeam, loginAdmin,
  startEventAsAdmin, stopEventAsAdmin, prisma,
} from './helpers.js';
import { solveChallenge } from './instance-helpers.js';

const WV01 = 'DOOM{a3f19c2b}';
const WV02 = 'DOOM{7d4e0a91}';
const HIDDEN = 'DOOM{d00d5f3a}';

let app: FastifyInstance;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetState(); });

// Correct submissions resolve the per-team instance answer (ignores any passed
// flag). Used only for intended successful solves of unlocked challenges.
function submit(cookie: string, challengeId: string, _flag?: string) {
  return solveChallenge(app, cookie, challengeId);
}
async function adminGet(url: string, cookie: string) {
  return app.inject({ method: 'GET', url, headers: { cookie } });
}
async function liveCounts() {
  return {
    users: await prisma.user.count({ where: { role: 'PLAYER' } }),
    teams: await prisma.team.count(),
    memberships: await prisma.teamMembership.count(),
    solves: await prisma.solve.count(),
    submissions: await prisma.submission.count(),
    hidden: await prisma.hiddenLevelResult.count() + await prisma.hiddenLevelAssignment.count(),
    sessions: await prisma.eventSession.count(),
  };
}

describe('independent-session lifecycle (archive then full reset)', () => {
  it('full cycle: empty start → play → stop archives all data → live reset to zero → fresh session 2', async () => {
    const admin = await loginAdmin(app);

    // 1. Session 1 starts completely empty.
    await startEventAsAdmin(app);
    expect((await liveCounts()).users).toBe(0);

    // 2–4. Users register, teams created, gameplay produced.
    const p = await registerPlayer(app, 'Neo', 's1@x.com');
    await createTeam(app, p, 'S1 Team');
    expect((await submit(p, 'wv-01', WV01)).statusCode).toBe(200);
    const before = await liveCounts();
    expect(before.users).toBe(1); expect(before.teams).toBe(1); expect(before.solves).toBe(1);

    // 5. Session 1 stops.
    await stopEventAsAdmin(app);

    // 6. Archive contains the data.
    const archives = JSON.parse((await adminGet('/api/admin/sessions', admin)).body).sessions;
    expect(archives.length).toBe(1);
    expect(archives[0].sessionNumber).toBe(1);
    expect(archives[0].numberOfUsers).toBe(1);
    expect(archives[0].totalSolves).toBe(1);

    // 7–13. Live state reset to zero / fresh.
    const after = await liveCounts();
    expect(after).toEqual({ users: 0, teams: 0, memberships: 0, solves: 0, submissions: 0, hidden: 0, sessions: 0 });

    // 14. Session 2 starts fresh.
    const s2 = JSON.parse((await app.inject({ method: 'POST', url: '/api/admin/event/start', headers: { cookie: admin } })).body).session;
    expect(s2.sessionNumber).toBe(2);
    expect((await liveCounts()).users).toBe(0);

    // 18. Session 2 creates new users/teams normally.
    const q = await registerPlayer(app, 'Trinity', 's2@x.com');
    await createTeam(app, q, 'S2 Team');
    // 15. Session 1 solves do not affect Session 2.
    const chRes = await app.inject({ method: 'GET', url: '/api/challenges', headers: { cookie: q } });
    expect(JSON.parse(chRes.body).challenges.find((c: any) => c.id === 'wv-01').solved).toBe(false);
    // 19. Session 1 archive remains downloadable after Session 2 starts.
    const stillThere = JSON.parse((await adminGet('/api/admin/sessions', admin)).body).sessions;
    expect(stillThere.some((a: any) => a.sessionNumber === 1)).toBe(true);
  });

  it('16/17. a Session-1 account cannot log into Session 2 and its team is gone', async () => {
    await startEventAsAdmin(app);
    await registerPlayer(app, 'Old', 'old@x.com', 'Password123');
    const admin = await loginAdmin(app);
    await stopEventAsAdmin(app);
    await app.inject({ method: 'POST', url: '/api/admin/event/start', headers: { cookie: admin } }); // session 2

    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'old@x.com', password: 'Password123' } });
    expect(login.statusCode).toBe(401); // account was wiped
    expect(await prisma.team.count()).toBe(0);
  });

  it('22/23. multiple START/STOP cycles each archive independently', async () => {
    const admin = await loginAdmin(app);
    // Cycle 1
    await startEventAsAdmin(app);
    const a = await registerPlayer(app, 'A', 'c1@x.com'); await createTeam(app, a, 'C1'); await submit(a, 'wv-01', WV01);
    await stopEventAsAdmin(app);
    // Cycle 2
    await app.inject({ method: 'POST', url: '/api/admin/event/start', headers: { cookie: admin } });
    const b = await registerPlayer(app, 'B', 'c2@x.com'); await createTeam(app, b, 'C2');
    await submit(b, 'wv-01', WV01); await submit(b, 'wv-02', WV02);
    await stopEventAsAdmin(app);

    const sessions = JSON.parse((await adminGet('/api/admin/sessions', admin)).body).sessions;
    expect(sessions.map((s: any) => s.sessionNumber).sort()).toEqual([1, 2]);
    const s1 = sessions.find((s: any) => s.sessionNumber === 1);
    const s2 = sessions.find((s: any) => s.sessionNumber === 2);
    expect(s1.totalSolves).toBe(1);
    expect(s2.totalSolves).toBe(2); // independent
  });

  it('24. admin account persists across all resets', async () => {
    const admin = await loginAdmin(app);
    for (let i = 0; i < 3; i++) {
      await app.inject({ method: 'POST', url: '/api/admin/event/start', headers: { cookie: admin } });
      await stopEventAsAdmin(app);
    }
    expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBe(1);
    // Admin can still reach admin endpoints.
    expect((await adminGet('/api/admin/statistics', admin)).statusCode).toBe(200);
  });

  it('admin dashboard reports zero live stats after STOP (NO_ACTIVE_SESSION)', async () => {
    const admin = await loginAdmin(app);
    await startEventAsAdmin(app);
    const p = await registerPlayer(app, 'Z', 'z@x.com'); await createTeam(app, p, 'ZT'); await submit(p, 'wv-01', WV01);
    await stopEventAsAdmin(app);

    const ev = JSON.parse((await adminGet('/api/admin/event', admin)).body);
    expect(ev.status).toBe('NO_ACTIVE_SESSION');
    expect(ev.session).toBeNull();
    expect(ev.teamCount).toBe(0);
    expect(ev.userCount).toBe(0);
    expect(ev.completedSessions).toBe(1);

    const st = JSON.parse((await adminGet('/api/admin/statistics', admin)).body).statistics;
    expect(st.registeredUsers).toBe(0);
    expect(st.solvedChallenges).toBe(0);
    expect(st.totalSubmissions).toBe(0);
  });
});

describe('session export (ZIP from immutable archive)', () => {
  async function archiveWithData() {
    const admin = await loginAdmin(app);
    await startEventAsAdmin(app);
    const p = await registerPlayer(app, 'Ex', 'exp@x.com');
    await createTeam(app, p, 'Exporters');
    await submit(p, 'wv-01', WV01);
    await submit(p, 'wv-01', 'DOOM{totally-wrong}'); // incorrect in the audit log
    await stopEventAsAdmin(app);
    const sessions = JSON.parse((await adminGet('/api/admin/sessions', admin)).body).sessions;
    return { admin, archive: sessions[0] };
  }

  it('20/21. admin can download; players get 403 on list, detail, and export', async () => {
    const { admin, archive } = await archiveWithData();
    // Start session 2 so a (new) participant account can exist to prove the 403.
    await app.inject({ method: 'POST', url: '/api/admin/event/start', headers: { cookie: admin } });
    const player = await registerPlayer(app, 'Pl', 'exp-pl@x.com');
    expect((await adminGet('/api/admin/sessions', player)).statusCode).toBe(403);
    expect((await adminGet(`/api/admin/sessions/${archive.id}`, player)).statusCode).toBe(403);
    expect((await adminGet(`/api/admin/sessions/${archive.id}/export`, player)).statusCode).toBe(403);
    expect((await adminGet(`/api/admin/sessions/${archive.id}/export`, admin)).statusCode).toBe(200);
  });

  it('6. export zip has the expected files, correct filename, and no secrets', async () => {
    const { admin, archive } = await archiveWithData();
    const res = await adminGet(`/api/admin/sessions/${archive.id}/export`, admin);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/zip');
    expect(res.headers['content-disposition']).toContain('hexhunt-session-001.zip');

    const zip = await JSZip.loadAsync(res.rawPayload);
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual([
      'hidden-results.csv', 'leaderboard.csv', 'participants.csv',
      'session-summary.json', 'solves.csv', 'submissions.csv', 'teams.csv',
    ]);

    let blob = '';
    for (const n of names) blob += await zip.files[n].async('string');
    expect(blob).not.toContain(WV01);
    expect(blob).not.toContain(HIDDEN);
    expect(blob.toLowerCase()).not.toContain('flaghash');
    expect(blob.toLowerCase()).not.toContain('passwordhash');

    const summary = JSON.parse(await zip.files['session-summary.json'].async('string'));
    expect(summary.sessionNumber).toBe(1);
    expect(summary.totalSolves).toBe(1);
    expect(summary.totalSubmissions).toBe(2);
    // Participant appears, solve recorded.
    expect(await zip.files['participants.csv'].async('string')).toContain('exp@x.com');
    expect(await zip.files['solves.csv'].async('string')).toContain('wv-01');
  });

  it('export/detail of a non-existent session is 404', async () => {
    const admin = await loginAdmin(app);
    expect((await adminGet('/api/admin/sessions/nope', admin)).statusCode).toBe(404);
    expect((await adminGet('/api/admin/sessions/nope/export', admin)).statusCode).toBe(404);
  });
});

describe('one-LIVE-per-event guard (DB level)', () => {
  it('rejects a second LIVE session for the same event', async () => {
    await startEventAsAdmin(app);
    const event = await prisma.event.findFirst({ orderBy: { createdAt: 'desc' } });
    await expect(
      prisma.eventSession.create({ data: { eventId: event!.id, sessionNumber: 999, status: 'LIVE', startedAt: new Date() } }),
    ).rejects.toThrow();
  });
});
