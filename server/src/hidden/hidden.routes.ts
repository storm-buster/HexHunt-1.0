import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/guards.js';
import { requireTeam } from '../teams/team.service.js';
import { getHiddenState, submitHidden } from './hidden.service.js';
import { getFinalBoss } from '../challenges/finalboss.service.js';
import { getUserById } from '../auth/auth.service.js';
import { getCurrentSession } from '../events/event.service.js';
import { submissionRateLimit } from '../middleware/rateLimit.js';

const submitSchema = z.object({ answer: z.string().min(1).max(200) });

export async function hiddenRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/hidden-level', async (request, reply) => {
    const { teamId } = await requireTeam(request.user!.sub);
    const state = await getHiddenState(request.user!.sub, teamId);
    return reply.send({ hidden: state });
  });

  app.post(
    '/hidden-level/submit',
    { preHandler: submissionRateLimit(() => 'hidden-level') },
    async (request, reply) => {
      const { teamId } = await requireTeam(request.user!.sub);
      const { answer } = submitSchema.parse(request.body);
      const outcome = await submitHidden(request.user!.sub, teamId, answer);
      return reply.send({
        result: outcome.correct ? 'correct' : 'incorrect',
        scoreDelta: outcome.scoreDelta,
      });
    },
  );

  app.get('/final-boss', async (request, reply) => {
    const { teamId } = await requireTeam(request.user!.sub);
    const session = await getCurrentSession();
    const user = await getUserById(request.user!.sub);
    if (!session) {
      return reply.send({ finalBoss: { unlocked: false, stones: [], stoneCount: 0, requiredStones: 6, reveal: null, participantName: user?.name ?? 'Operative' } });
    }
    const view = await getFinalBoss(session.id, teamId, user?.name ?? 'Operative');
    return reply.send({ finalBoss: view });
  });
}
