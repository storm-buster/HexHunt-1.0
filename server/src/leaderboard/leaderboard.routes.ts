import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guards.js';
import { getPlayerLeaderboard } from './leaderboard.service.js';

export async function leaderboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/leaderboard', { preHandler: requireAuth }, async (_request, reply) => {
    const leaderboard = await getPlayerLeaderboard();
    return reply.send({ leaderboard });
  });
}
