import type { FastifyReply, FastifyRequest } from 'fastify';
import { Errors } from '../middleware/errors.js';

export interface SessionPayload {
  sub: string; // user id
  role: 'PLAYER' | 'ADMIN';
  email: string;
}

// @fastify/jwt provides `request.user` typed from FastifyJWT['user'] below.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: SessionPayload;
    user: SessionPayload;
  }
}

// Require a valid authenticated session (JWT from httpOnly cookie or Bearer).
export async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  try {
    const payload = await request.jwtVerify<SessionPayload>();
    request.user = payload;
  } catch {
    throw Errors.unauthorized();
  }
}

// Require an authenticated ADMIN. Role is validated server-side from the
// signed token — a forged client-side role field is never trusted.
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(request, reply);
  if (request.user?.role !== 'ADMIN') {
    throw Errors.forbidden('Admin privileges required');
  }
}
