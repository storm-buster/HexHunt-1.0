import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/guards.js';
import { createTeam, getTeamForUser, joinTeam } from './team.service.js';
import { broadcast } from '../realtime/hub.js';

const createSchema = z.object({ name: z.string().min(2).max(40) });
const joinSchema = z.object({ inviteCode: z.string().min(4).max(16) });

export async function teamRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/team', async (request, reply) => {
    const team = await getTeamForUser(request.user!.sub);
    return reply.send({ team });
  });

  app.post('/teams', async (request, reply) => {
    const { name } = createSchema.parse(request.body);
    const team = await createTeam(request.user!.sub, name);
    broadcast({ type: 'TEAM_REGISTERED', payload: { teamId: team.id, name: team.name } });
    return reply.status(201).send({ team });
  });

  app.post('/teams/join', async (request, reply) => {
    const { inviteCode } = joinSchema.parse(request.body);
    const team = await joinTeam(request.user!.sub, inviteCode);
    broadcast({
      type: 'TEAM_JOINED',
      payload: { teamId: team.id, name: team.name, memberCount: team.memberCount },
    });
    return reply.send({ team });
  });
}
