import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeApp, resetState, sessionCookie, loginAdmin } from './helpers.js';

let app: FastifyInstance;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetState(); });

describe('auth', () => {
  it('registers a new player and sets a session cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'Avinash', email: 'avinash@x.com', password: 'Password123' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.user.email).toBe('avinash@x.com');
    expect(body.user.role).toBe('PLAYER');
    expect(body.user.passwordHash).toBeUndefined();
    expect(res.cookies.some((c) => c.name === 'doom_session')).toBe(true);
  });

  it('rejects duplicate email', async () => {
    const p = { name: 'Dup', email: 'dup@x.com', password: 'Password123' };
    await app.inject({ method: 'POST', url: '/api/auth/register', payload: p });
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: p });
    expect(res.statusCode).toBe(409);
  });

  it('rejects malformed email and weak password', async () => {
    const bad1 = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: 'A', email: 'nope', password: 'Password123' } });
    expect(bad1.statusCode).toBe(400);
    const bad2 = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: 'A', email: 'a@x.com', password: 'short' } });
    expect(bad2.statusCode).toBe(400);
  });

  it('logs in with correct credentials and rejects wrong ones', async () => {
    await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: 'Loki', email: 'log@x.com', password: 'Password123' } });
    const ok = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'log@x.com', password: 'Password123' } });
    expect(ok.statusCode).toBe(200);
    const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'log@x.com', password: 'wrong' } });
    expect(bad.statusCode).toBe(401);
  });

  it('returns current user on /me and 401 without session', async () => {
    const reg = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: 'Loki', email: 'me@x.com', password: 'Password123' } });
    const cookie = sessionCookie(reg as any);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    const none = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(none.statusCode).toBe(401);
  });

  it('admin can authenticate and is ADMIN role', async () => {
    const cookie = await loginAdmin(app);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(JSON.parse(me.body).user.role).toBe('ADMIN');
  });
});
