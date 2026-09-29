import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../auth/guards.js';
import { startEvent, closeEvent } from '../events/event.service.js';
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

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // Every admin route independently verifies authenticated === true AND role === ADMIN.
  app.addHook('preHandler', requireAdmin);

  app.get('/event', async (_req, reply) => reply.send(await adminEventView()));

  app.post('/event/start', async (_req, reply) => {
    const event = await startEvent();
    return reply.send({ event: { id: event.id, status: event.status, startedAt: event.startedAt } });
  });

  app.post('/event/close', async (_req, reply) => {
    const event = await closeEvent();
    return reply.send({ event: { id: event.id, status: event.status, closedAt: event.closedAt } });
  });

  app.get('/teams', async (_req, reply) => reply.send({ teams: await adminTeams() }));
  app.get('/users', async (_req, reply) => reply.send({ users: await adminUsers() }));
  app.get('/leaderboard', async (_req, reply) =>
    reply.send({ leaderboard: await getAdminLeaderboard() }),
  );
  app.get('/submissions', async (req, reply) => {
    const q = req.query as { limit?: string };
    const limit = q.limit ? Number(q.limit) : 100;
    return reply.send({ submissions: await adminSubmissions(limit) });
  });
  app.get('/challenges', async (_req, reply) =>
    reply.send({ challenges: await adminChallengeMonitor() }),
  );
  app.get('/hidden-level', async (_req, reply) =>
    reply.send({ hidden: await adminHiddenLevel() }),
  );
  app.get('/statistics', async (_req, reply) =>
    reply.send({ statistics: await adminStatistics() }),
  );
}
