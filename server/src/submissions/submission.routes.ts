import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/guards.js';
import { requireTeam } from '../teams/team.service.js';
import { processSubmission } from './submission.service.js';
import { submissionRateLimit } from '../middleware/rateLimit.js';

const submitSchema = z.object({
  challengeId: z.string().min(1).max(40),
  flag: z.string().min(1).max(200),
});

export async function submissionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.post(
    '/submissions',
    {
      // Runs AFTER requireAuth so req.user is populated: limits per user per
      // challenge (server-side; never relies on frontend cooldowns).
      preHandler: submissionRateLimit((req) => {
        const body = req.body as { challengeId?: string } | undefined;
        return body?.challengeId ?? 'unknown';
      }),
    },
    async (request, reply) => {
      const { teamId } = await requireTeam(request.user!.sub);
      const { challengeId, flag } = submitSchema.parse(request.body);
      const outcome = await processSubmission({
        userId: request.user!.sub,
        teamId,
        challengeId,
        flag,
        ip: request.ip,
      });

      if (outcome.result === 'CORRECT') {
        return reply.send({
          result: 'correct',
          awardedPoints: outcome.awardedPoints,
          challengeId: outcome.challengeId,
        });
      }
      // Generic incorrect response — never reveals the expected value.
      return reply.send({ result: 'incorrect' });
    },
  );
}
