import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  makeApp, resetState, registerPlayer, createTeam, loginAdmin, startEventAsAdmin,
  userIdByEmail, currentSession, prisma,
} from './helpers.js';
import { solveChallenge } from './instance-helpers.js';

const WV01 = 'DOOM{a3f19c2b}';

let app: FastifyInstance;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetState(); });

function sendTelemetry(cookie: string, body: unknown) {
  return app.inject({ method: 'POST', url: '/api/telemetry', headers: { cookie }, payload: body as any });
}

describe('anti-cheat telemetry — recording', () => {
  it('records coarse counters scoped to the current session + the user\'s team', async () => {
    await startEventAsAdmin(app);
    const cookie = await registerPlayer(app, 'Tele', 'tele@x.com');
    await createTeam(app, cookie, 'Tele Team');
    const userId = await userIdByEmail('tele@x.com');
    const session = (await currentSession())!;
    const team = await prisma.team.findFirst({ where: { name: 'Tele Team' } });

    const res = await sendTelemetry(cookie, { events: [{ type: 'COPY_ATTEMPT', count: 2 }, { type: 'PASTE_ATTEMPT' }] });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).recorded).toBe(2);

    const rows = await prisma.antiCheatEvent.findMany({});
    expect(rows.length).toBe(2);
    for (const r of rows) {
      expect(r.sessionId).toBe(session.id);
      expect(r.teamId).toBe(team!.id);
      expect(r.userId).toBe(userId);
    }
    const copy = rows.find((r) => r.type === 'COPY_ATTEMPT')!;
    expect(copy.count).toBe(2);
  });

  it('ignores a client-supplied teamId (server derives team from the session)', async () => {
    await startEventAsAdmin(app);
    const cookie = await registerPlayer(app, 'Faker', 'faker@x.com');
    await createTeam(app, cookie, 'Real Team');
    const realTeam = await prisma.team.findFirst({ where: { name: 'Real Team' } });

    // Attempt to attribute telemetry to a bogus team id in the body.
    await sendTelemetry(cookie, { events: [{ type: 'COPY_ATTEMPT' }], teamId: 'totally-fake-team-id' });

    const rows = await prisma.antiCheatEvent.findMany({});
    expect(rows.length).toBe(1);
    expect(rows[0].teamId).toBe(realTeam!.id); // never the claimed id
  });

  it('accepts only whitelisted signal types; unknown types are dropped', async () => {
    await startEventAsAdmin(app);
    const cookie = await registerPlayer(app, 'Allow', 'allow@x.com');
    await createTeam(app, cookie, 'Allow Team');

    const res = await sendTelemetry(cookie, {
      events: [{ type: 'COPY_ATTEMPT' }, { type: 'AI_DETECTED' }, { type: 'exec(evil)' }],
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).recorded).toBe(1); // only COPY_ATTEMPT accepted
    const rows = await prisma.antiCheatEvent.findMany({});
    expect(rows.map((r) => r.type)).toEqual(['COPY_ATTEMPT']);
  });

  it('stores no clipboard/answer content — only type + numeric count', async () => {
    await startEventAsAdmin(app);
    const cookie = await registerPlayer(app, 'Safe', 'safe@x.com');
    await createTeam(app, cookie, 'Safe Team');
    // Even if a client crams extra fields, only type/count are ever persisted.
    await sendTelemetry(cookie, { events: [{ type: 'PASTE_ATTEMPT', count: 1, clipboard: 'DOOM{leak}', answer: 'secret' } as any] });
    const rows = await prisma.antiCheatEvent.findMany({});
    expect(rows.length).toBe(1);
    const serialized = JSON.stringify(rows[0]);
    expect(serialized).not.toMatch(/DOOM\{|secret|clipboard|answer/i);
    expect(typeof rows[0].count).toBe('number');
  });

  it('no-ops (recorded:0) when the player has no team', async () => {
    await startEventAsAdmin(app);
    const cookie = await registerPlayer(app, 'NoTeam', 'noteam@x.com'); // registered, no team
    const res = await sendTelemetry(cookie, { events: [{ type: 'COPY_ATTEMPT' }] });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).recorded).toBe(0);
    expect(await prisma.antiCheatEvent.count()).toBe(0);
  });

  it('requires authentication', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/telemetry', payload: { events: [{ type: 'COPY_ATTEMPT' }] } });
    expect(res.statusCode).toBe(401);
  });
});

describe('anti-cheat admin summary', () => {
  it('is admin-only (players get 403)', async () => {
    await startEventAsAdmin(app);
    const player = await registerPlayer(app, 'P', 'ac-p@x.com');
    expect((await app.inject({ method: 'GET', url: '/api/admin/anti-cheat', headers: { cookie: player } })).statusCode).toBe(403);
    const admin = await loginAdmin(app);
    expect((await app.inject({ method: 'GET', url: '/api/admin/anti-cheat', headers: { cookie: admin } })).statusCode).toBe(200);
  });

  it('aggregates per-team counters and flags fast solves', async () => {
    await startEventAsAdmin(app);
    const cookie = await registerPlayer(app, 'Quick', 'quick@x.com');
    await createTeam(app, cookie, 'Quick Team');
    const team = await prisma.team.findFirst({ where: { name: 'Quick Team' } });

    // Generate some telemetry + a fast solve (elapsed ≈ 0s < threshold).
    await sendTelemetry(cookie, { events: [{ type: 'COPY_ATTEMPT', count: 3 }, { type: 'PASTE_ATTEMPT', count: 5 }] });
    await solveChallenge(app, cookie, 'wv-01');

    const admin = await loginAdmin(app);
    const res = await app.inject({ method: 'GET', url: '/api/admin/anti-cheat', headers: { cookie: admin } });
    const summary = JSON.parse(res.body).antiCheat;
    expect(summary.sessionNumber).toBe(1);
    expect(summary.thresholds.fastSolveSeconds).toBeGreaterThan(0);
    const row = summary.teams.find((t: any) => t.teamId === team!.id);
    expect(row.counters.COPY_ATTEMPT).toBe(3);
    expect(row.counters.PASTE_ATTEMPT).toBe(5);
    expect(row.suspicious.fastSolves).toBeGreaterThanOrEqual(1);
    expect(row.suspicious.solveCount).toBe(1);
  });

  it('telemetry is wiped with the session (STOP archive+wipe)', async () => {
    await startEventAsAdmin(app);
    const cookie = await registerPlayer(app, 'Wipe', 'wipe@x.com');
    await createTeam(app, cookie, 'Wipe Team');
    await sendTelemetry(cookie, { events: [{ type: 'COPY_ATTEMPT' }] });
    expect(await prisma.antiCheatEvent.count()).toBe(1);

    const admin = await loginAdmin(app);
    await app.inject({ method: 'POST', url: '/api/admin/event/close', headers: { cookie: admin } });
    expect(await prisma.antiCheatEvent.count()).toBe(0); // cascaded with the session
  });
});
