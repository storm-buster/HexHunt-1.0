import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeApp, resetState, registerPlayer, createTeam, sessionCookie, startEventAsAdmin } from './helpers.js';

let app: FastifyInstance;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetState(); await startEventAsAdmin(app); });

// Backend contract that the player Team page depends on. A shape mismatch here
// (e.g. team present without a `members` array) is what would blank the page.
describe('team-flow (Team page backing API)', () => {
  it('TEST 1 — unauthenticated user cannot use /me or /team', async () => {
    const me = await app.inject({ method: 'GET', url: '/api/me' });
    expect(me.statusCode).toBe(401);
    const team = await app.inject({ method: 'GET', url: '/api/team' });
    expect(team.statusCode).toBe(401);
  });

  it('TEST 2 — authenticated user with no team gets team === null (Create/Join state)', async () => {
    const cookie = await registerPlayer(app, 'Solo', 'solo@x.com');
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    const body = JSON.parse(me.body);
    expect(body.user).toBeTruthy();
    expect(body.team).toBeNull();
    expect(body.score).toBe(0);

    const team = await app.inject({ method: 'GET', url: '/api/team', headers: { cookie } });
    expect(team.statusCode).toBe(200);
    expect(JSON.parse(team.body).team).toBeNull();
  });

  it('TEST 3 — authenticated user with a team gets a well-formed team (members array + memberCount)', async () => {
    const cookie = await registerPlayer(app, 'Owner', 'owner-tf@x.com');
    await createTeam(app, cookie, 'Team Contract');
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    const { team } = JSON.parse(me.body);
    expect(team).toBeTruthy();
    expect(team.name).toBe('Team Contract');
    expect(Array.isArray(team.members)).toBe(true); // Team page maps over this
    expect(team.members.length).toBe(1);
    expect(typeof team.memberCount).toBe('number');
    expect(team.inviteCode).toBeTruthy();
  });

  it('TEST 5 — /api/event is public so hydration never depends on a failing auth call', async () => {
    // The Team page hydrates from /api/event (public) + /api/me (auth). Event must
    // always resolve so a logged-out visit does not throw during hydration.
    const ev = await app.inject({ method: 'GET', url: '/api/event' });
    expect(ev.statusCode).toBe(200);
    expect(JSON.parse(ev.body).event.serverTime).toBeTruthy();
  });

  it('expired/invalid session behaves like unauthenticated (no crash path)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: 'doom_session=not-a-valid-jwt' },
    });
    expect(res.statusCode).toBe(401);
    // sanity: a fresh valid session still works afterwards
    const reg = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: 'Fresh', email: 'fresh-tf@x.com', password: 'Password123' } });
    const cookie = sessionCookie(reg as any);
    const ok = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(ok.statusCode).toBe(200);
  });
});
