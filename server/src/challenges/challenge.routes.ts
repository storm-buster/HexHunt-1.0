import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/guards.js';
import { requireTeam } from '../teams/team.service.js';
import {
  getPlayerChallenge,
  getPlayerChallenges,
  getTeamProgress,
} from './challenge.service.js';
import { checkPortalAnswer } from './portal.service.js';

const portalSchema = z.object({ answer: z.string().min(1).max(200) });

export async function challengeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/challenges', async (request, reply) => {
    const { teamId } = await requireTeam(request.user!.sub);
    const challenges = await getPlayerChallenges(teamId);
    return reply.send({ challenges });
  });

  app.get('/challenges/:id', async (request, reply) => {
    const { teamId } = await requireTeam(request.user!.sub);
    const { id } = request.params as { id: string };
    const challenge = await getPlayerChallenge(teamId, id);
    return reply.send({ challenge });
  });

  // Portal mini-puzzle validation (non-scoring UX). Answer is validated
  // server-side so it never ships in the client bundle.
  app.post('/challenges/:id/portal-check', async (request, reply) => {
    await requireTeam(request.user!.sub);
    const { id } = request.params as { id: string };
    const { answer } = portalSchema.parse(request.body);
    const correct = await checkPortalAnswer(id, answer);
    return reply.send({ correct });
  });

  app.get('/progress', async (request, reply) => {
    const { teamId } = await requireTeam(request.user!.sub);
    const progress = await getTeamProgress(teamId);
    return reply.send({ progress });
  });
}
