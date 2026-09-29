import type { WebSocket } from '@fastify/websocket';

export type RealtimeEventType =
  | 'CTF_STARTED'
  | 'CTF_CLOSED'
  | 'TEAM_REGISTERED'
  | 'TEAM_JOINED'
  | 'CHALLENGE_SOLVED'
  | 'SCORE_UPDATED'
  | 'LEADERBOARD_UPDATED'
  | 'HIDDEN_LEVEL_ACTIVATED'
  | 'HIDDEN_LEVEL_RESULT';

export interface RealtimeMessage {
  type: RealtimeEventType;
  payload?: unknown;
  ts?: string;
}

// In-process fan-out hub. For a single-node deployment this is sufficient;
// a multi-node deployment would back this with Redis pub/sub.
const clients = new Set<WebSocket>();

export function addClient(socket: WebSocket): void {
  clients.add(socket);
}

export function removeClient(socket: WebSocket): void {
  clients.delete(socket);
}

export function clientCount(): number {
  return clients.size;
}

export function broadcast(message: RealtimeMessage): void {
  const data = JSON.stringify({ ...message, ts: message.ts ?? new Date().toISOString() });
  for (const socket of clients) {
    try {
      if (socket.readyState === socket.OPEN) socket.send(data);
    } catch {
      // Drop broken sockets silently; cleanup happens on close event.
      clients.delete(socket);
    }
  }
}
