import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

// Application-level error with an HTTP status and a stable machine code.
export class AppError extends Error {
  statusCode: number;
  code: string;
  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const Errors = {
  unauthorized: (msg = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', msg),
  forbidden: (msg = 'Forbidden') => new AppError(403, 'FORBIDDEN', msg),
  notFound: (msg = 'Not found') => new AppError(404, 'NOT_FOUND', msg),
  conflict: (msg = 'Conflict') => new AppError(409, 'CONFLICT', msg),
  badRequest: (msg = 'Bad request') => new AppError(400, 'BAD_REQUEST', msg),
  tooMany: (msg = 'Too many requests') => new AppError(429, 'RATE_LIMITED', msg),
  eventNotLive: (msg = 'CTF is not live') => new AppError(409, 'EVENT_NOT_LIVE', msg),
  sessionNotActive: (msg = 'CTF session is not active') => new AppError(409, 'EVENT_NOT_LIVE', msg),
  locked: (msg = 'Challenge is locked') => new AppError(403, 'CHALLENGE_LOCKED', msg),
  alreadySolved: (msg = 'Challenge already solved by your team') =>
    new AppError(409, 'ALREADY_SOLVED', msg),
};

// Central error handler — never leaks stack traces or secrets to clients.
export function errorHandler(
  error: FastifyError | AppError | ZodError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  // Validation errors from Zod
  if (error instanceof ZodError) {
    reply.status(400).send({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request data', details: error.flatten() },
    });
    return;
  }

  if (error instanceof AppError) {
    reply.status(error.statusCode).send({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  // Fastify built-in rate-limit / validation errors carry a statusCode
  const anyErr = error as FastifyError;
  if (anyErr.statusCode && anyErr.statusCode < 500) {
    reply.status(anyErr.statusCode).send({
      error: { code: anyErr.code ?? 'REQUEST_ERROR', message: anyErr.message },
    });
    return;
  }

  // Unknown/internal error — log server-side, return generic message.
  request.log.error({ err: error }, 'Unhandled error');
  reply.status(500).send({
    error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' },
  });
}
