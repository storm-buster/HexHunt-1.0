import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { makeApp, resetState, registerPlayer, loginAdmin, prisma } from './helpers.js';
import { verifyPassword } from '../src/auth/password.js';

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? 'admin@doomsday.ctf').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'ChangeMe_Admin123!';

let app: FastifyInstance;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetState(); });

describe('admin authentication', () => {
  it('TEST 6 — admin user exists in the database with role ADMIN', async () => {
    const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    expect(admin).toBeTruthy();
    expect(admin!.role).toBe('ADMIN');
    expect(admin!.active).toBe(true);
  });

  it('TEST 7 — admin password verifies using ADMIN_PASSWORD', async () => {
    const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    const ok = await verifyPassword(admin!.passwordHash, ADMIN_PASSWORD);
    expect(ok).toBe(true);
  });

  it('TEST 9 — admin can log in and reach an admin endpoint', async () => {
    const login = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    expect(JSON.parse(login.body).user.role).toBe('ADMIN');

    const cookie = await loginAdmin(app);
    const ev = await app.inject({ method: 'GET', url: '/api/admin/event', headers: { cookie } });
    expect(ev.statusCode).toBe(200);
  });

  it('TEST 8 — a non-admin player cannot access admin endpoints', async () => {
    const player = await registerPlayer(app, 'Grunt', 'grunt-admin@x.com');
    const res = await app.inject({ method: 'GET', url: '/api/admin/statistics', headers: { cookie: player } });
    expect(res.statusCode).toBe(403);
  });

  it('TEST 10 — admin can start and close the CTF', async () => {
    const cookie = await loginAdmin(app);
    const start = await app.inject({ method: 'POST', url: '/api/admin/event/start', headers: { cookie } });
    expect(start.statusCode).toBe(200);
    expect(JSON.parse(start.body).session.status).toBe('LIVE');
    const close = await app.inject({ method: 'POST', url: '/api/admin/event/close', headers: { cookie } });
    expect(close.statusCode).toBe(200);
    expect(JSON.parse(close.body).session.status).toBe('COMPLETED');
  });
});
