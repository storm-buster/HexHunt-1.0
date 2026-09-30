import type { FastifyInstance } from 'fastify';
import { addClient, removeClient } from './hub.js';
import type { SessionPayload } from '../auth/guards.js';
import { prisma } from '../db/prisma.js';

// Realtime channels. Both authenticate via the signed session (httpOnly cookie
// or Bearer). Admin gets the global admin channel; players are subscribed ONLY
// to their own team (team id resolved server-side from membership — a client
// can never choose or spoof another team).
export async function realtimeRoutes(app: FastifyInstance): Promise<void> {
  // ── Admin channel (unchanged behaviour) ───────────────────
  app.get('/ws/admin', { websocket: true }, (conn: any, req) => {
    const socket = conn.socket ?? conn;
    void (async () => {
      try {
        const payload = await req.jwtVerify<SessionPayload>();
        if (payload.role !== 'ADMIN') {
          socket.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Admin only' } }));
          socket.close();
          return;
        }
      } catch {
        socket.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Unauthorized' } }));
        socket.close();
        return;
      }
      addClient(socket, { role: 'ADMIN' });
      socket.send(JSON.stringify({ type: 'CONNECTED', ts: new Date().toISOString() }));
      socket.on('close', () => removeClient(socket));
      socket.on('error', () => removeClient(socket));
      socket.on('message', (raw: Buffer) => {
        try {
          if (JSON.parse(raw.toString())?.type === 'PING') socket.send(JSON.stringify({ type: 'PONG' }));
        } catch { /* ignore malformed */ }
      });
    })();
  });

  // ── Player team channel ───────────────────────────────────
  app.get('/ws/team', { websocket: true }, (conn: any, req) => {
    const socket = conn.socket ?? conn;
    void (async () => {
      let payload: SessionPayload;
      try {
        payload = await req.jwtVerify<SessionPayload>();
      } catch {
        socket.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Unauthorized' } }));
        socket.close();
        return;
      }
      // Team id is derived from the authenticated user's membership — never from
      // any client-supplied value → a user cannot subscribe to another team.
      const membership = await prisma.teamMembership.findUnique({ where: { userId: payload.sub } });
      if (!membership) {
        socket.send(JSON.stringify({ type: 'ERROR', payload: { message: 'No team' } }));
        socket.close();
        return;
      }
      addClient(socket, { role: 'PLAYER', teamId: membership.teamId });
      socket.send(JSON.stringify({ type: 'CONNECTED', ts: new Date().toISOString() }));
      socket.on('close', () => removeClient(socket));
      socket.on('error', () => removeClient(socket));
      socket.on('message', (raw: Buffer) => {
        try {
          if (JSON.parse(raw.toString())?.type === 'PING') socket.send(JSON.stringify({ type: 'PONG' }));
        } catch { /* ignore malformed */ }
      });
    })();
  });
}
