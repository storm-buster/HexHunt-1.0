import type { FastifyInstance } from 'fastify';
import { getEventView } from './event.service.js';

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  // Public: anyone (even pre-auth) can read event status + authoritative time.
  app.get('/event', async (_request, reply) => {
    const view = await getEventView(false);
    return reply.send({ event: view });
  });
}
