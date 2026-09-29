import { useEffect, useState, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'

// Deterministic hex coordinates that cycle for ambient life
const HEX_POOL = [
  '0x7F3A', '0xD4E1', '0x9B2C', '0x1F8D', '0xA6C3', '0x5E07',
  '0x82F4', '0xCB19', '0x3D6E', '0xF0A5', '0x64B8', '0x2791',
  '0xE53F', '0x0C84', '0x98DA', '0x4162', '0xBC7F', '0x6E0B',
]

const SECTOR_MAP: Record<string, string> = {
  '/hub': 'COMMAND',
  '/universe/webverse': 'WEBVERSE',
  '/universe/osintverse': 'OSINTVERSE',
  '/universe/darknet': 'DARKNET',
  '/final-boss': 'DOOM CORE',
}

function getSectorLabel(pathname: string): string {
  if (SECTOR_MAP[pathname]) return SECTOR_MAP[pathname]
  if (pathname.startsWith('/challenge/')) return 'BREACH'
  if (pathname.startsWith('/portal/')) return 'PORTAL'
  if (pathname.startsWith('/universe/')) return 'SECTOR'
  return 'TRANSIT'
}

function getTimeString(): string {
  const now = new Date()
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  const s = String(now.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function getClearance(stoneCount: number): string {
  if (stoneCount === 0) return 'LEVEL 0'
  if (stoneCount <= 2) return 'LEVEL 1'
  if (stoneCount <= 4) return 'LEVEL 2'
  if (stoneCount <= 5) return 'LEVEL 3'
  return 'MAXIMUM'
}

export default function BattleworldOS() {
  const { state } = useGame()
  const location = useLocation()
  const [time, setTime] = useState(getTimeString())
  const [coordIdx, setCoordIdx] = useState(0)
  const [glitchCoord, setGlitchCoord] = useState(false)
  const intervalRef = useRef<number | null>(null)

  const stoneCount = state.stones.length
  const sector = getSectorLabel(location.pathname)
  const doomProtocol = stoneCount === 6 ? 'ARMED' : 'STANDBY'
  const protocolColor = stoneCount === 6 ? 'var(--emerald)' : 'var(--text-dim)'

  useEffect(() => {
    // Update clock every second
    const clockId = window.setInterval(() => setTime(getTimeString()), 1000)

    // Cycle coordinates every 5 seconds for ambient life
    const coordId = window.setInterval(() => {
      // 2% chance of easter egg
      if (Math.random() < 0.02) {
        setGlitchCoord(true)
        setTimeout(() => setGlitchCoord(false), 800)
      }
      setCoordIdx(i => (i + 1) % HEX_POOL.length)
    }, 5000)

    return () => {
      window.clearInterval(clockId)
      window.clearInterval(coordId)
    }
  }, [])

  const coord = glitchCoord ? 'DOOM//WATCHES' : HEX_POOL[coordIdx]

  // Stone diamonds
  const stoneDiamonds = Array.from({ length: 6 }, (_, i) =>
    i < stoneCount ? '◆' : '◇'
  ).join('')

  // Rules of Hooks: every hook above runs unconditionally on every render.
  // We only decide whether to render AFTER all hooks, so the hook count never
  // changes when `state.participant` hydrates. (Previously an early `return null`
  // sat before `useEffect`, so hydration added a hook mid-lifecycle and React
  // threw "rendered more hooks than during the previous render", blanking the app.)
  if (!state.participant || location.pathname === '/') return null

  return (
    <>
      <div className="bw-os" aria-hidden="true">
        {/* Top-left: System info */}
        <div className="bw-os__tl">
          <span className="bw-os__label">BATTLEWORLD OS</span>
          <span className="bw-os__dim">BUILD 616.∞</span>
          <span className="bw-os__dim">REALITY ENGINE: <span className="bw-os__active">ACTIVE</span></span>
        </div>

        {/* Top-right: Clock + Sector */}
        <div className="bw-os__tr">
          <span className="bw-os__time">{time}</span>
          <span className="bw-os__dim">SECTOR: <span className="bw-os__highlight">{sector}</span></span>
        </div>

        {/* Bottom-left: Operative info */}
        <div className="bw-os__bl">
          <span className="bw-os__dim">OPERATIVE: <span className="bw-os__active">{state.participant.name.toUpperCase()}</span></span>
          <span className="bw-os__dim">CLEARANCE: {getClearance(stoneCount)}</span>
          <span className="bw-os__dim" style={{ color: glitchCoord ? 'var(--danger)' : undefined }}>
            COORD: {coord}
          </span>
        </div>

        {/* Bottom-right: Protocol + Stones */}
        <div className="bw-os__br">
          <span className="bw-os__dim">DOOM PROTOCOL: <span style={{ color: protocolColor }}>{doomProtocol}</span></span>
          <span className="bw-os__dim">MULTIVERSE LINK: <span className="bw-os__active">STABLE</span></span>
          <span className="bw-os__stones">{stoneDiamonds}</span>
        </div>
      </div>

      <style>{`
        .bw-os {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 50;
          font-family: var(--mono, 'Space Mono', monospace);
          font-size: 0.55rem;
          letter-spacing: 0.1em;
          color: var(--text-dim, #445048);
          text-transform: uppercase;
          user-select: none;
        }
        .bw-os__tl, .bw-os__tr, .bw-os__bl, .bw-os__br {
          position: absolute;
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 12px 16px;
        }
        .bw-os__tl { top: 52px; left: 0; }
        .bw-os__tr { top: 52px; right: 0; text-align: right; align-items: flex-end; }
        .bw-os__bl { bottom: 0; left: 0; }
        .bw-os__br { bottom: 0; right: 0; text-align: right; align-items: flex-end; }
        .bw-os__label {
          color: var(--bronze, #8A6238);
          font-size: 0.6rem;
          letter-spacing: 0.15em;
        }
        .bw-os__dim { color: var(--text-dim, #445048); }
        .bw-os__active { color: var(--emerald, #2BE066); }
        .bw-os__highlight { color: var(--bronze-light, #A77B45); }
        .bw-os__time {
          color: var(--text-muted, #66736A);
          font-size: 0.7rem;
          letter-spacing: 0.2em;
        }
        .bw-os__stones {
          color: var(--emerald, #2BE066);
          font-size: 0.7rem;
          letter-spacing: 0.3em;
        }

        @media (max-width: 768px) {
          .bw-os__tl, .bw-os__bl { display: none; }
          .bw-os__tr { top: 50px; padding: 8px 10px; }
          .bw-os__br { padding: 8px 10px; }
        }
        @media (max-width: 480px) {
          .bw-os { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .bw-os { display: none; }
        }
      `}</style>
    </>
  )
}
