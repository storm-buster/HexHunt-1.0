import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/guards.js';
import { requireTeam } from '../teams/team.service.js';
import { getCurrentSession } from '../events/event.service.js';
import {
  getPlayerChallenge,
  getPlayerChallenges,
  getTeamProgress,
  assertChallengeAccessible,
} from './challenge.service.js';
import { isMultiStep, verifyStep } from './challenge-instance.service.js';
import { recordTelemetry } from '../anticheat/anticheat.service.js';
import { checkPortalAnswer } from './portal.service.js';
import { Errors } from '../middleware/errors.js';

const portalSchema = z.object({ answer: z.string().min(1).max(200) });
const stepSchema = z.object({ input: z.string().min(1).max(200) });

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

  // Multi-step intermediate verification (server-authoritative state machine).
  // Session + team + instance are resolved server-side; the client cannot skip
  // steps or submit on behalf of another team.
  app.post('/challenges/:id/step', async (request, reply) => {
    const { teamId } = await requireTeam(request.user!.sub);
    const session = await getCurrentSession();
    if (!session) throw Errors.eventNotLive();
    const { id } = request.params as { id: string };
    if (!isMultiStep(id)) throw Errors.notFound('This challenge has no intermediate step');
    // Challenge must be unlocked for this team (sequential gating).
    await assertChallengeAccessible(session.id, teamId, id);
    const { input } = stepSchema.parse(request.body);

    const result = await verifyStep(session.id, teamId, id, input);
    // Behavioral signal only — never the submitted value.
    void recordTelemetry(request.user!.sub, [{ type: result?.ok ? 'STEP_COMPLETED' : 'INVALID_STEP_INPUT' }]).catch(() => {});
    return reply.send({ step: result });
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
