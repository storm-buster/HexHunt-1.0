import type { FastifyInstance } from 'fastify';
import { addClient, removeClient } from './hub.js';
import type { SessionPayload } from '../auth/guards.js';

// Admin realtime channel. The socket authenticates via the signed session
// (httpOnly cookie or Bearer token) and must be an ADMIN.
export async function realtimeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/ws/admin', { websocket: true }, (conn: any, req) => {
    // @fastify/websocket v10 passes a SocketStream (conn.socket); newer
    // versions pass the WebSocket directly. Normalize both.
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

      addClient(socket);
      socket.send(JSON.stringify({ type: 'CONNECTED', ts: new Date().toISOString() }));

      socket.on('close', () => removeClient(socket));
      socket.on('error', () => removeClient(socket));
      // Respond to client pings to support reconnect/keepalive.
      socket.on('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg?.type === 'PING') socket.send(JSON.stringify({ type: 'PONG' }));
        } catch {
          /* ignore malformed */
        }
      });
    })();
  });
}
