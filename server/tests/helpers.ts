import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app/build.js';
import { prisma } from '../src/db/prisma.js';
import { _resetRateLimits } from '../src/middleware/rateLimit.js';

export { prisma };

export async function makeApp(): Promise<FastifyInstance> {
  const app = await buildApp();
  await app.ready();
  return app;
}

// Reset all dynamic state between tests (keep seeded challenges + admin).
export async function resetState(): Promise<void> {
  _resetRateLimits();
  await prisma.submission.deleteMany({});
  await prisma.solve.deleteMany({});
  await prisma.hiddenLevelResult.deleteMany({});
  await prisma.hiddenLevelAssignment.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({ where: { role: 'PLAYER' } });
  const event = await prisma.event.findFirst({ orderBy: { createdAt: 'desc' } });
  if (event) {
    await prisma.event.update({
      where: { id: event.id },
      data: {
        status: 'NOT_STARTED',
        startedAt: null,
        closedAt: null,
        hiddenActivationAt: null,
        hiddenActivated: false,
      },
    });
  }
}

// Extract the session cookie from a login/register response.
export function sessionCookie(res: { cookies: { name: string; value: string }[] }): string {
  const c = res.cookies.find((x) => x.name === 'doom_session');
  if (!c) throw new Error('No session cookie set');
  return `doom_session=${c.value}`;
}

export async function registerPlayer(
  app: FastifyInstance,
  name: string,
  email: string,
  password = 'Password123',
): Promise<string> {
  const safeName = name.length >= 2 ? name : `${name}-op`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { name: safeName, email, password },
  });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.body}`);
  return sessionCookie(res as any);
}

export async function loginAdmin(app: FastifyInstance): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: process.env.ADMIN_EMAIL ?? 'admin@doomsday.ctf', password: process.env.ADMIN_PASSWORD ?? 'ChangeMe_Admin123!' },
  });
  if (res.statusCode !== 200) throw new Error(`admin login failed: ${res.body}`);
  return sessionCookie(res as any);
}

export async function createTeam(app: FastifyInstance, cookie: string, name: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/teams',
    headers: { cookie },
    payload: { name },
  });
  if (res.statusCode !== 201) throw new Error(`createTeam failed: ${res.body}`);
  return JSON.parse(res.body).team.inviteCode as string;
}

export async function startEventAsAdmin(app: FastifyInstance): Promise<void> {
  const adminCookie = await loginAdmin(app);
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/event/start',
    headers: { cookie: adminCookie },
  });
  if (res.statusCode !== 200) throw new Error(`start event failed: ${res.body}`);
}

// Look up a user's id by email (tests map selected users back to their cookies).
export async function userIdByEmail(email: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!u) throw new Error(`user not found: ${email}`);
  return u.id;
}

export async function joinTeam(app: FastifyInstance, cookie: string, inviteCode: string): Promise<void> {
  const res = await app.inject({
    method: 'POST', url: '/api/teams/join', headers: { cookie }, payload: { inviteCode },
  });
  if (res.statusCode !== 200) throw new Error(`joinTeam failed: ${res.body}`);
}
