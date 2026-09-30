import { API_BASE } from './client'

export interface TeamSocketMessage {
  type: string
  payload?: any
  ts?: string
}

// Reconnecting player realtime client for the team channel. Authenticates via
// the httpOnly session cookie on the WS handshake (server resolves the team).
// Mirrors the admin dashboard socket: bounded backoff + ping/pong keepalive.
export class TeamSocket {
  private ws: WebSocket | null = null
  private handler: (msg: TeamSocketMessage) => void
  private closed = false
  private retry = 0
  private pingTimer: number | null = null
  /** connected=true on open; reconnected=true when this open followed a drop. */
  onStatus?: (connected: boolean, reconnected: boolean) => void

  constructor(handler: (msg: TeamSocketMessage) => void) {
    this.handler = handler
  }

  connect(): void {
    this.closed = false
    const url = API_BASE.replace(/^http/, 'ws') + '/ws/team'
    const ws = new WebSocket(url)
    this.ws = ws
    const wasReconnect = this.retry > 0

    ws.onopen = () => {
      this.retry = 0
      this.onStatus?.(true, wasReconnect)
      this.pingTimer = window.setInterval(() => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'PING' }))
      }, 25000)
    }
    ws.onmessage = (ev) => {
      try {
        this.handler(JSON.parse(ev.data))
      } catch {
        /* ignore malformed */
      }
    }
    ws.onclose = () => {
      this.onStatus?.(false, false)
      if (this.pingTimer) window.clearInterval(this.pingTimer)
      if (!this.closed) {
        this.retry += 1
        const delay = Math.min(1000 * this.retry, 8000) // bounded backoff, no tight loop
        window.setTimeout(() => this.connect(), delay)
      }
    }
    ws.onerror = () => ws.close()
  }

  close(): void {
    this.closed = true
    if (this.pingTimer) window.clearInterval(this.pingTimer)
    this.ws?.close()
  }
}
