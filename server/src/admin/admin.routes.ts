import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../auth/guards.js';
import { startSession, stopSession } from '../events/event.service.js';
import { getAdminLeaderboard } from '../leaderboard/leaderboard.service.js';
import {
  adminEventView,
  adminTeams,
  adminUsers,
  adminSubmissions,
  adminChallengeMonitor,
  adminHiddenLevel,
  adminStatistics,
} from './admin.service.js';
import { listSessions, getSessionDetail, buildSessionExport } from './session.service.js';
import { Errors } from '../middleware/errors.js';

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // Every admin route independently verifies authenticated === true AND role === ADMIN.
  app.addHook('preHandler', requireAdmin);

  app.get('/event', async (_req, reply) => reply.send(await adminEventView()));

  // START = create a new LIVE session (idempotent if one is already live).
  app.post('/event/start', async (_req, reply) => {
    const session = await startSession();
    return reply.send({ session: { id: session.id, sessionNumber: session.sessionNumber, status: session.status, startedAt: session.startedAt } });
  });

  // STOP = complete the current LIVE session (archived; no reopen).
  app.post('/event/close', async (_req, reply) => {
    const session = await stopSession();
    return reply.send({ session: { id: session.id, sessionNumber: session.sessionNumber, status: session.status, completedAt: session.completedAt } });
  });

  app.get('/teams', async (_req, reply) => reply.send({ teams: await adminTeams() }));
  app.get('/users', async (_req, reply) => reply.send({ users: await adminUsers() }));
  app.get('/leaderboard', async (_req, reply) => reply.send({ leaderboard: await getAdminLeaderboard() }));
  app.get('/submissions', async (req, reply) => {
    const q = req.query as { limit?: string };
    const limit = q.limit ? Number(q.limit) : 100;
    return reply.send({ submissions: await adminSubmissions(limit) });
  });
  app.get('/challenges', async (_req, reply) => reply.send({ challenges: await adminChallengeMonitor() }));
  app.get('/hidden-level', async (_req, reply) => reply.send({ hidden: await adminHiddenLevel() }));
  app.get('/statistics', async (_req, reply) => reply.send({ statistics: await adminStatistics() }));

  // ── Session history + export (admin-only) ─────────────────
  app.get('/sessions', async (_req, reply) => reply.send({ sessions: await listSessions() }));

  app.get('/sessions/:sessionId', async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const detail = await getSessionDetail(sessionId);
    if (!detail) throw Errors.notFound('Session not found');
    return reply.send({ session: detail });
  });

  app.get('/sessions/:sessionId/leaderboard', async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const detail = await getSessionDetail(sessionId);
    if (!detail) throw Errors.notFound('Session not found');
    return reply.send({ leaderboard: detail.leaderboard });
  });

  // ZIP export generated from the stored session id (remains available forever).
  app.get('/sessions/:sessionId/export', async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const exp = await buildSessionExport(sessionId);
    if (!exp) throw Errors.notFound('Session not found');
    reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', `attachment; filename="${exp.filename}"`)
      .send(exp.buffer);
  });
}
