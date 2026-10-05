import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/guards.js';
import { recordTelemetry } from './anticheat.service.js';

// Body carries ONLY coarse signal types + counts — no clipboard content, no
// answers, no free-form text is accepted or stored. The team/session are
// derived server-side from the authenticated user; any client-provided team is
// ignored (there is no team field in the schema).
const telemetrySchema = z.object({
  events: z
    .array(
      z.object({
        type: z.string().min(1).max(40),
        count: z.number().int().positive().max(100).optional(),
      }),
    )
    .max(50),
});

export async function telemetryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.post(
    '/telemetry',
    {
      // Coarse rate limit — telemetry is debounced client-side; this caps abuse.
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { events } = telemetrySchema.parse(request.body);
      const result = await recordTelemetry(request.user!.sub, events);
      return reply.send({ ok: true, recorded: result.recorded });
    },
  );
}
