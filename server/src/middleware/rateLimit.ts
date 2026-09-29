import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config/index.js';
import { Errors } from './errors.js';

// Simple in-memory sliding-window limiter. Keyed by authenticated user + a
// scope (e.g. challenge id) so it must run AFTER authentication — unlike
// @fastify/rate-limit which fires in onRequest before req.user exists.
//
// For a single-node deployment this is sufficient. A multi-node deployment
// would back this with Redis.
const buckets = new Map<string, number[]>();

function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    buckets.set(key, arr);
    return false;
  }
  arr.push(now);
  buckets.set(key, arr);
  return true;
}

// Rate-limit submissions per user per challenge.
export function submissionRateLimit(scope: (req: FastifyRequest) => string) {
  const max = config.submitRate.max;
  const windowMs = config.submitRate.windowSeconds * 1000;
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const userId = request.user?.sub ?? request.ip;
    const key = `${userId}:${scope(request)}`;
    if (!allow(key, max, windowMs)) {
      throw Errors.tooMany('Too many submissions — slow down and try again shortly');
    }
  };
}

// Test helper: clear all buckets between runs.
export function _resetRateLimits(): void {
  buckets.clear();
}
