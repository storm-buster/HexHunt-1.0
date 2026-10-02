import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config, COOKIE_NAME } from '../config/index.js';
import { requireAuth } from './guards.js';
import { getUserById, loginUser, registerUser } from './auth.service.js';
import { requireParticipantSession, isSessionLive } from '../events/event.service.js';
import { Errors } from '../middleware/errors.js';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(60),
  email: z.string().email('A valid email is required').max(160),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(200)
    .refine((p) => /[a-zA-Z]/.test(p) && /[0-9]/.test(p), {
      message: 'Password must contain letters and numbers',
    }),
});

const loginSchema = z.object({
  email: z.string().email().max(160),
  password: z.string().min(1).max(200),
});

function setSessionCookie(reply: any, token: string) {
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: '/',
    maxAge: config.jwtExpiresIn,
    signed: false,
  });
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/register', async (request, reply) => {
    // Participants may only register while a session is LIVE.
    await requireParticipantSession();
    const body = registerSchema.parse(request.body);
    const user = await registerUser(body);
    const token = await reply.jwtSign(
      { sub: user.id, role: user.role, email: user.email },
      { expiresIn: config.jwtExpiresIn },
    );
    setSessionCookie(reply, token);
    return reply.status(201).send({ user });
  });

  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const { user, payload } = await loginUser(body);
    // Admin may log in regardless of session state; participants only while LIVE.
    if (user.role !== 'ADMIN' && !(await isSessionLive())) {
      throw Errors.sessionNotActive();
    }
    const token = await reply.jwtSign(payload, { expiresIn: config.jwtExpiresIn });
    setSessionCookie(reply, token);
    return reply.send({ user });
  });

  app.post('/logout', async (_request, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return reply.send({ ok: true });
  });

  app.get('/me', { preHandler: requireAuth }, async (request, reply) => {
    const user = await getUserById(request.user!.sub);
    if (!user) throw Errors.unauthorized();
    return reply.send({ user });
  });
}
