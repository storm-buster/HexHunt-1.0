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
  | 'HIDDEN_LEVEL_RESULT'
  | 'TEAM_CHALLENGE_SOLVED';

export interface RealtimeMessage {
  type: RealtimeEventType;
  payload?: unknown;
  ts?: string;
}

interface ClientMeta {
  role: 'ADMIN' | 'PLAYER';
  teamId?: string; // players only — resolved server-side from the session
}

// In-process fan-out hub. Admin sockets receive the global admin channel;
// player sockets are subscribed only to their own team. Single-node only; a
// multi-node deployment would back this with Redis pub/sub.
const clients = new Map<WebSocket, ClientMeta>();

export function addClient(socket: WebSocket, meta: ClientMeta): void {
  clients.set(socket, meta);
}

export function removeClient(socket: WebSocket): void {
  clients.delete(socket);
}

export function clientCount(): number {
  return clients.size;
}

export function adminClientCount(): number {
  let n = 0;
  for (const meta of clients.values()) if (meta.role === 'ADMIN') n++;
  return n;
}

function sendTo(socket: WebSocket, data: string): void {
  try {
    if (socket.readyState === socket.OPEN) socket.send(data);
  } catch {
    clients.delete(socket);
  }
}

function serialize(message: RealtimeMessage): string {
  return JSON.stringify({ ...message, ts: message.ts ?? new Date().toISOString() });
}

// Admin channel — every ADMIN socket receives it (unchanged admin behaviour).
export function broadcast(message: RealtimeMessage): void {
  const data = serialize(message);
  for (const [socket, meta] of clients) {
    if (meta.role === 'ADMIN') sendTo(socket, data);
  }
}

// Team channel — only sockets subscribed to `teamId` (that team's players).
// Admins are not team-scoped, so this never leaks a team's events to admins or
// to other teams.
export function broadcastToTeam(teamId: string, message: RealtimeMessage): void {
  const data = serialize(message);
  for (const [socket, meta] of clients) {
    if (meta.teamId === teamId) sendTo(socket, data);
  }
}
