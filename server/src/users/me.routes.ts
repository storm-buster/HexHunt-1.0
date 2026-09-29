import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth/guards.js';
import { getUserById } from '../auth/auth.service.js';
import { getTeamForUser } from '../teams/team.service.js';
import { getTeamScore } from '../leaderboard/leaderboard.service.js';
import { Errors } from '../middleware/errors.js';

export async function meRoutes(app: FastifyInstance): Promise<void> {
  // Consolidated bootstrap endpoint for the player frontend.
  app.get('/me', { preHandler: requireAuth }, async (request, reply) => {
    const user = await getUserById(request.user!.sub);
    if (!user) throw Errors.unauthorized();
    const team = await getTeamForUser(user.id);
    const score = team ? await getTeamScore(team.id) : 0;
    return reply.send({ user, team, score });
  });
}
