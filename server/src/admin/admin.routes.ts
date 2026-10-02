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
import { listArchives, getArchiveDetail, buildArchiveExport } from './archive.service.js';
import { Errors } from '../middleware/errors.js';

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // Every admin route independently verifies authenticated === true AND role === ADMIN.
  app.addHook('preHandler', requireAdmin);

  app.get('/event', async (_req, reply) => reply.send(await adminEventView()));

  // START = create a new, EMPTY live session (idempotent if one is already live).
  app.post('/event/start', async (_req, reply) => {
    const session = await startSession();
    return reply.send({ session: { id: session.id, sessionNumber: session.sessionNumber, status: session.status, startedAt: session.startedAt } });
  });

  // STOP = archive the current session then WIPE all live participant/gameplay
  // state. No reopen. Returns the archived session number + archive id.
  app.post('/event/close', async (_req, reply) => {
    const result = await stopSession();
    return reply.send({ stopped: result });
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

  // ── Session history + export (admin-only, from immutable archives) ──
  app.get('/sessions', async (_req, reply) => reply.send({ sessions: await listArchives() }));

  app.get('/sessions/:sessionId', async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const detail = await getArchiveDetail(sessionId);
    if (!detail) throw Errors.notFound('Session not found');
    return reply.send({ session: detail });
  });

  app.get('/sessions/:sessionId/leaderboard', async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const detail = await getArchiveDetail(sessionId);
    if (!detail) throw Errors.notFound('Session not found');
    return reply.send({ leaderboard: detail.leaderboard });
  });

  // ZIP export generated from the immutable archive (available forever).
  app.get('/sessions/:sessionId/export', async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const exp = await buildArchiveExport(sessionId);
    if (!exp) throw Errors.notFound('Session not found');
    reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', `attachment; filename="${exp.filename}"`)
      .send(exp.buffer);
  });
}
