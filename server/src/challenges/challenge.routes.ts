import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/guards.js';
import { requireTeam } from '../teams/team.service.js';
import { getCurrentSession } from '../events/event.service.js';
import {
  getPlayerChallenge,
  getPlayerChallenges,
  getTeamProgress,
} from './challenge.service.js';
import { checkPortalAnswer } from './portal.service.js';
import { Errors } from '../middleware/errors.js';

const portalSchema = z.object({ answer: z.string().min(1).max(200) });

export async function challengeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/challenges', async (request, reply) => {
    const { teamId } = await requireTeam(request.user!.sub);
    const session = await getCurrentSession();
    // No live session → player waiting state (nothing solved/unlocked).
    if (!session) return reply.send({ challenges: [] });
    const challenges = await getPlayerChallenges(session.id, teamId);
    return reply.send({ challenges });
  });

  app.get('/challenges/:id', async (request, reply) => {
    const { teamId } = await requireTeam(request.user!.sub);
    const session = await getCurrentSession();
    if (!session) throw Errors.eventNotLive();
    const { id } = request.params as { id: string };
    const challenge = await getPlayerChallenge(session.id, teamId, id);
    return reply.send({ challenge });
  });

  // Portal mini-puzzle validation (non-scoring UX; answer validated server-side).
  app.post('/challenges/:id/portal-check', async (request, reply) => {
    await requireTeam(request.user!.sub);
    const { id } = request.params as { id: string };
    const { answer } = portalSchema.parse(request.body);
    const correct = await checkPortalAnswer(id, answer);
    return reply.send({ correct });
  });

  app.get('/progress', async (request, reply) => {
    const { teamId } = await requireTeam(request.user!.sub);
    const session = await getCurrentSession();
    if (!session) {
      return reply.send({ progress: { solvedChallengeIds: [], stones: [], solvedCount: 0, totalStandard: 0 } });
    }
    const progress = await getTeamProgress(session.id, teamId);
    return reply.send({ progress });
  });
}
