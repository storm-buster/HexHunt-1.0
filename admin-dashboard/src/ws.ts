import { API_BASE } from './api';

export type WSHandler = (msg: { type: string; payload?: any; ts?: string }) => void;

// Reconnecting WebSocket to the admin realtime channel. Authenticates via the
// httpOnly session cookie (sent automatically on the same-site handshake).
export class AdminSocket {
  private ws: WebSocket | null = null;
  private handler: WSHandler;
  private closed = false;
  private retry = 0;
  private pingTimer: number | null = null;
  onStatus?: (connected: boolean) => void;

  constructor(handler: WSHandler) {
    this.handler = handler;
  }

  connect(): void {
    this.closed = false;
    const url = API_BASE.replace(/^http/, 'ws') + '/ws/admin';
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      this.onStatus?.(true);
      this.pingTimer = window.setInterval(() => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'PING' }));
      }, 25000);
    };
    ws.onmessage = (ev) => {
      try {
        this.handler(JSON.parse(ev.data));
      } catch {
        /* ignore malformed */
      }
    };
    ws.onclose = () => {
      this.onStatus?.(false);
      if (this.pingTimer) window.clearInterval(this.pingTimer);
      if (!this.closed) {
        this.retry += 1;
        const delay = Math.min(1000 * this.retry, 8000);
        window.setTimeout(() => this.connect(), delay);
      }
    };
    ws.onerror = () => ws.close();
  }

  close(): void {
    this.closed = true;
    if (this.pingTimer) window.clearInterval(this.pingTimer);
    this.ws?.close();
  }
}
