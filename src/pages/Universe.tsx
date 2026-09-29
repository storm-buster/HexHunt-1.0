import { useParams, useNavigate } from 'react-router-dom'
import React, { useState, useRef, useCallback, type CSSProperties, type ReactElement } from 'react'
import { useGame } from '../contexts/GameContext'
import { challenges } from '../data/challenges'
import type { Universe as UniverseType } from '../data/challenges'
import StoneCounter from '../components/StoneCounter'
import PageTransition from '../components/PageTransition'
import BattleworldBg from '../components/BattleworldBg'
import CommandButton from '../components/CommandButton'

// ── Hero SVG illustrations ──
function WebverseHero() {
  return (
    <svg viewBox="0 0 200 80" className="univ__hero-svg" aria-hidden="true">
      <defs>
        <linearGradient id="wv-line" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--wv-primary)" stopOpacity="0" />
          <stop offset="50%" stopColor="var(--wv-primary)" stopOpacity="0.7" />
          <stop offset="100%" stopColor="var(--wv-primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" y1="20" x2="200" y2="20" stroke="url(#wv-line)" strokeWidth="1" />
      <line x1="0" y1="40" x2="200" y2="40" stroke="url(#wv-line)" strokeWidth="1" />
      <line x1="0" y1="60" x2="200" y2="60" stroke="url(#wv-line)" strokeWidth="1" />
      <circle cx="30" cy="20" r="3" fill="var(--wv-primary)" opacity="0.8" />
      <circle cx="80" cy="20" r="3" fill="var(--wv-primary)" opacity="0.6" />
      <circle cx="150" cy="20" r="3" fill="var(--wv-primary)" opacity="0.6" />
      <circle cx="60" cy="40" r="3" fill="var(--wv-primary)" opacity="0.7" />
      <circle cx="120" cy="40" r="3" fill="var(--wv-primary)" opacity="0.7" />
      <circle cx="40" cy="60" r="3" fill="var(--wv-primary)" opacity="0.5" />
      <circle cx="100" cy="60" r="3" fill="var(--wv-primary)" opacity="0.6" />
      <circle cx="170" cy="60" r="3" fill="var(--wv-primary)" opacity="0.5" />
      <line x1="30" y1="20" x2="30" y2="40" stroke="var(--wv-primary)" strokeWidth="0.5" opacity="0.3" />
      <line x1="80" y1="20" x2="80" y2="60" stroke="var(--wv-primary)" strokeWidth="0.5" opacity="0.3" />
      <line x1="150" y1="20" x2="150" y2="40" stroke="var(--wv-primary)" strokeWidth="0.5" opacity="0.3" />
    </svg>
  )
}

function OsintverseHero() {
  return (
    <svg viewBox="0 0 200 80" className="univ__hero-svg" aria-hidden="true">
      <defs>
        <radialGradient id="os-radar" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--os-primary)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--os-primary)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="40" r="32" fill="url(#os-radar)" />
      <circle cx="100" cy="40" r="32" fill="none" stroke="var(--os-primary)" strokeWidth="0.5" opacity="0.5" />
      <circle cx="100" cy="40" r="22" fill="none" stroke="var(--os-primary)" strokeWidth="0.5" opacity="0.4" />
      <circle cx="100" cy="40" r="12" fill="none" stroke="var(--os-primary)" strokeWidth="0.5" opacity="0.3" />
      <line x1="68" y1="40" x2="132" y2="40" stroke="var(--os-primary)" strokeWidth="0.5" opacity="0.4" />
      <line x1="100" y1="8" x2="100" y2="72" stroke="var(--os-primary)" strokeWidth="0.5" opacity="0.4" />
      <circle cx="115" cy="28" r="2" fill="var(--os-primary)" opacity="0.9" />
      <circle cx="85" cy="50" r="1.5" fill="var(--os-primary)" opacity="0.7" />
      <line x1="100" y1="40" x2="120" y2="20" stroke="var(--os-primary)" strokeWidth="1" opacity="0.6" />
    </svg>
  )
}

function DarknetHero() {
  return (
    <svg viewBox="0 0 200 80" className="univ__hero-svg" aria-hidden="true">
      <rect x="10" y="20" width="20" height="4" fill="var(--dn-primary)" opacity="0.6" />
      <rect x="40" y="20" width="40" height="4" fill="var(--dn-primary)" opacity="0.4" />
      <rect x="90" y="20" width="30" height="4" fill="var(--dn-primary)" opacity="0.5" />
      <rect x="130" y="20" width="20" height="4" fill="var(--dn-primary)" opacity="0.7" />
      <rect x="160" y="20" width="30" height="4" fill="var(--dn-primary)" opacity="0.3" />
      <rect x="20" y="32" width="30" height="4" fill="var(--dn-primary)" opacity="0.4" />
      <rect x="60" y="32" width="20" height="4" fill="var(--dn-primary)" opacity="0.6" />
      <rect x="90" y="32" width="50" height="4" fill="var(--dn-primary)" opacity="0.5" />
      <rect x="10" y="44" width="40" height="4" fill="var(--dn-primary)" opacity="0.5" />
      <rect x="60" y="44" width="30" height="4" fill="var(--dn-primary)" opacity="0.3" />
      <rect x="100" y="44" width="20" height="4" fill="var(--dn-primary)" opacity="0.6" />
      <rect x="130" y="44" width="40" height="4" fill="var(--dn-primary)" opacity="0.5" />
      <line x1="0" y1="56" x2="200" y2="56" stroke="var(--dn-primary)" strokeWidth="1" opacity="0.6" />
    </svg>
  )
}

// ── Challenge node with 3D hover ──
function ChallengeNode({
  ch,
  status,
  color,
  onClick,
  idx,
}: {
  ch: any
  status: string
  color: string
  onClick: () => void | Promise<void>
  idx: number
  key?: string
}) {
  const cardRef = useRef<HTMLButtonElement>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (status === 'locked' || !cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const px = (e.clientX - cx) / (rect.width / 2)
    const py = (e.clientY - cy) / (rect.height / 2)
    setTilt({ x: -py * 5, y: px * 5 })
  }, [status])

  const handleMouseLeave = useCallback(() => setTilt({ x: 0, y: 0 }), [])

  const statusIcon = status === 'solved' ? '◈' : status === 'current' ? '◉' : '◇'
  const statusLabel = status === 'solved' ? 'SYNCHRONIZED' : status === 'current' ? 'ACTIVE' : 'SEALED'

  return (
    <div
      className={`ch-node ch-node--${status}`}
      style={{ animationDelay: `${idx * 0.1}s`, ['--ch-color' as any]: color } as CSSProperties}
    >
      {/* Connection line to next node */}
      {idx > 0 && (
        <div className={`ch-node__line ch-node__line--${status === 'locked' ? 'dim' : 'lit'}`} />
      )}

      <button
        ref={cardRef}
        className={`ch-node__card ${status === 'locked' ? 'ch-node__card--locked' : ''}`}
        onClick={onClick}
        disabled={status === 'locked'}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        data-sfx="hover"
        style={{
          transform: `perspective(800px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        }}
      >
        {/* Status icon */}
        <div className={`ch-node__icon ch-node__icon--${status}`}>
          <span>{statusIcon}</span>
        </div>

        {/* Node content */}
        <div className="ch-node__body">
          <div className="ch-node__header">
            <span className="ch-node__id">{ch.id.toUpperCase()}</span>
            <span className="ch-node__pts">{ch.points} PTS</span>
          </div>
          <h3 className="ch-node__title">{ch.title}</h3>
          <p className="ch-node__desc">{ch.description}</p>
          <div className="ch-node__footer">
            <span className="ch-node__cat">{ch.category.toUpperCase()}</span>
            <span className={`ch-node__status ch-node__status--${status}`}>
              {statusLabel}
            </span>
          </div>
        </div>

        {/* Locked seal */}
        {status === 'locked' && (
          <div className="ch-node__seal">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>SEALED</span>
          </div>
        )}
      </button>
    </div>
  )
}

// ── Universe metadata ──
const UNIVERSE_META: Record<UniverseType, {
  name: string; icon: string; color: string; glow: string; bg: string
  desc: string; tagline: string; challengeIds: string[]; Hero: () => ReactElement
  bgVariant: 'webverse' | 'osintverse' | 'darknet'
  sectorNum: string; stone: string; threat: string; integrity: string
}> = {
  webverse: {
    name: 'WEBVERSE', icon: '🌐', color: 'var(--wv-primary)', glow: 'var(--wv-glow)', bg: 'var(--wv-bg)',
    desc: 'Navigate broken portals. Decode the matrix. Break through.',
    tagline: 'The web is fractured. The code is broken. The reality is corrupted.',
    challengeIds: ['wv-01', 'wv-02', 'wv-03'], Hero: WebverseHero,
    bgVariant: 'webverse', sectorNum: '01', stone: 'SPACE / MIND / REALITY', threat: 'MODERATE', integrity: '81',
  },
  osintverse: {
    name: 'OSINTVERSE', icon: '🔍', color: 'var(--os-primary)', glow: 'var(--os-glow)', bg: 'var(--os-bg)',
    desc: 'Trace the breadcrumbs. Every signal leaves a trace.',
    tagline: 'Intelligence was never meant to be found. But you found it.',
    challengeIds: ['os-01', 'os-02', 'os-03'], Hero: OsintverseHero,
    bgVariant: 'osintverse', sectorNum: '02', stone: 'POWER / TIME / SOUL', threat: 'HIGH', integrity: '64',
  },
  darknet: {
    name: 'DARKNET', icon: '🕸️', color: 'var(--dn-primary)', glow: 'var(--dn-glow)', bg: 'var(--dn-bg)',
    desc: 'The darkest corner of the multiverse. Dig deep.',
    tagline: 'The multiverse bleeds. Forensics, crypto, and exploitation ahead.',
    challengeIds: ['dn-01', 'dn-02', 'dn-03', 'dn-04', 'dn-05', 'dn-06'], Hero: DarknetHero,
    bgVariant: 'darknet', sectorNum: '03', stone: 'ALL REMAINING', threat: 'CRITICAL', integrity: '37',
  },
}

export default function Universe() {
  const { universeId } = useParams<{ universeId: string }>()
  const navigate = useNavigate()
  const { state, getProgress, isChallengeUnlocked, isChallengeSolved } = useGame()

  const universe = universeId as UniverseType
  const meta = UNIVERSE_META[universe]
  if (!meta) { navigate('/hub'); return null }

  const univChallenges = meta.challengeIds.map(id => challenges.find(c => c.id === id)).filter(Boolean)
  const solvedCount = univChallenges.filter(ch => ch && isChallengeSolved(ch.id)).length
  const progress = Math.round((solvedCount / meta.challengeIds.length) * 100)

  const getStatus = (chId: string) => {
    if (isChallengeSolved(chId)) return 'solved'
    if (isChallengeUnlocked(chId)) return 'current'
    return 'locked'
  }

  return (
    <PageTransition>
      <BattleworldBg variant={meta.bgVariant} />
      <main className="univ" style={{ ['--univ-color' as any]: meta.color, ['--univ-glow' as any]: meta.glow } as any}>

        <CommandButton variant="ghost" onClick={() => navigate('/hub')} style={{ marginBottom: '1.5rem' }}>
          ← RETURN TO COMMAND
        </CommandButton>

        {/* ── Mission Control Header ── */}
        <header className="univ__header">
          <div className="univ__header-top">
            <span className="univ__sector">BATTLEWORLD // SECTOR {meta.sectorNum}</span>
            <span className="univ__status-badge univ__status-badge--danger">REALITY: COMPROMISED</span>
          </div>

          <div className="univ__hero-wrap">
            <meta.Hero />
          </div>

          <h1 className="univ__title">{meta.name}</h1>

          {/* System readout panels */}
          <div className="univ__readout">
            <div className="univ__readout-item">
              <span className="univ__readout-label">REALITY INTEGRITY</span>
              <div className="univ__bar">
                <div className="univ__bar-fill" style={{ width: `${meta.integrity}%` }} />
              </div>
              <span className="univ__readout-value">{meta.integrity}%</span>
            </div>
            <div className="univ__readout-item">
              <span className="univ__readout-label">ACTIVE OPERATIONS</span>
              <span className="univ__readout-value univ__readout-value--highlight">{String(meta.challengeIds.length).padStart(2, '0')}</span>
            </div>
            <div className="univ__readout-item">
              <span className="univ__readout-label">THREAT LEVEL</span>
              <span className={`univ__readout-value ${meta.threat === 'CRITICAL' ? 'univ__readout-value--danger' : ''}`}>{meta.threat}</span>
            </div>
            <div className="univ__readout-item">
              <span className="univ__readout-label">INFINITY STONES</span>
              <span className="univ__readout-value">{meta.stone}</span>
            </div>
          </div>

          <p className="univ__tagline">{meta.tagline}</p>

          {/* Progress bar */}
          <div className="univ__progress">
            <div className="univ__progress-bar">
              <div className="univ__progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="univ__progress-text">{solvedCount}/{meta.challengeIds.length} SYNCHRONIZED • {progress}%</span>
          </div>
        </header>

        {/* ── Challenge Node Path ── */}
        <section className="univ__nodes">
          <h2 className="univ__nodes-title">◆ OPERATION NODES</h2>
          {univChallenges.map((ch, idx) => {
            if (!ch) return null
            const status = getStatus(ch.id)
            return (
              <ChallengeNode
                key={ch.id}
                ch={ch}
                status={status}
                color={meta.color}
                onClick={() => status !== 'locked' && navigate(`/challenge/${ch.id}`)}
                idx={idx}
              />
            )
          })}
        </section>

        {/* ── Stone progress ── */}
        <div className="univ__stones">
          <p className="univ__stones-label">INFINITY STONE PROGRESS</p>
          <StoneCounter collected={state.stones} />
        </div>
      </main>

      <style>{`
        .univ {
          position: relative; z-index: 1;
          padding: 2rem; max-width: 840px; margin: 0 auto;
        }

        /* ── Header ── */
        .univ__header {
          text-align: center; margin-bottom: 3rem;
          padding-bottom: 2rem; border-bottom: 1px solid var(--s3);
        }
        .univ__header-top {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.5rem;
        }
        .univ__sector {
          font-family: var(--mono, 'Space Mono', monospace);
          font-size: 0.75rem; color: var(--bronze, #8A6238);
          letter-spacing: 0.2em;
        }
        .univ__status-badge {
          font-family: var(--mono, 'Space Mono', monospace);
          font-size: 0.65rem; padding: 0.2rem 0.6rem;
          border-radius: 2px; letter-spacing: 0.1em;
        }
        .univ__status-badge--danger {
          background: rgba(199,58,50,0.1); border: 1px solid var(--danger-dim);
          color: var(--danger);
        }
        .univ__hero-wrap {
          max-width: 360px; margin: 0 auto 1.5rem;
        }
        .univ__hero-svg { width: 100%; height: auto; }
        .univ__title {
          font-family: var(--heading, 'Barlow Condensed', sans-serif);
          font-weight: 800; font-size: 3.5rem; margin: 0 0 1.5rem;
          color: var(--univ-color); text-shadow: 0 0 30px var(--univ-glow);
          text-transform: uppercase; letter-spacing: 0.03em;
        }

        /* ── Readout ── */
        .univ__readout {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 1rem; margin-bottom: 1.5rem;
          background: var(--s1); border: 1px solid var(--s3);
          border-radius: 4px; padding: 1rem;
        }
        .univ__readout-item {
          display: flex; flex-direction: column; gap: 0.25rem;
        }
        .univ__readout-label {
          font-family: var(--mono, 'Space Mono', monospace);
          font-size: 0.55rem; color: var(--text-dim);
          letter-spacing: 0.15em; text-transform: uppercase;
        }
        .univ__readout-value {
          font-family: var(--mono, 'Space Mono', monospace);
          font-size: 0.8rem; color: var(--text-primary);
        }
        .univ__readout-value--highlight { color: var(--univ-color); }
        .univ__readout-value--danger { color: var(--danger); }
        .univ__bar {
          width: 100%; height: 3px; background: var(--s3);
          border-radius: 2px; overflow: hidden;
        }
        .univ__bar-fill {
          height: 100%; background: var(--univ-color);
          box-shadow: 0 0 6px var(--univ-glow);
          transition: width 0.6s ease-out;
        }
        .univ__tagline {
          color: var(--text-secondary); font-family: var(--sans, 'Rajdhani', sans-serif);
          font-size: 1.05rem; max-width: 560px; margin: 0 auto 1.5rem;
        }

        /* ── Progress ── */
        .univ__progress { max-width: 400px; margin: 0 auto; }
        .univ__progress-bar {
          height: 4px; background: var(--s1); border-radius: 2px; overflow: hidden;
        }
        .univ__progress-fill {
          height: 100%; background: var(--univ-color);
          box-shadow: 0 0 10px var(--univ-glow);
          transition: width 0.6s ease-out;
        }
        .univ__progress-text {
          font-family: var(--mono, 'Space Mono', monospace);
          font-size: 0.75rem; color: var(--text-muted);
          margin-top: 0.75rem; display: block; text-align: center;
        }

        /* ── Challenge Nodes ── */
        .univ__nodes {
          margin-bottom: 3rem;
        }
        .univ__nodes-title {
          font-family: var(--mono, 'Space Mono', monospace);
          font-size: 0.7rem; color: var(--bronze);
          letter-spacing: 0.15em; margin-bottom: 1.5rem;
        }

        .ch-node {
          position: relative; margin-bottom: 0.5rem;
          animation: fadeSlideUp 0.4s ease-out both;
        }
        .ch-node__line {
          position: absolute; left: 28px; top: -8px; width: 2px; height: 8px;
        }
        .ch-node__line--lit {
          background: var(--ch-color);
          box-shadow: 0 0 4px var(--univ-glow);
        }
        .ch-node__line--dim {
          background: var(--s3);
        }

        .ch-node__card {
          display: flex; align-items: flex-start; gap: 1rem;
          width: 100%; text-align: left;
          background: var(--s1); border: 1px solid var(--s3);
          border-radius: 4px; padding: 1.25rem;
          cursor: pointer; color: inherit; font: inherit;
          transition: transform 0.25s ease-out, box-shadow 0.25s ease-out, border-color 0.25s;
          transform-style: preserve-3d;
        }
        .ch-node__card:hover:not(.ch-node__card--locked) {
          border-color: var(--ch-color);
          box-shadow: 0 0 20px rgba(43,224,102,0.1), 0 8px 30px rgba(0,0,0,0.3);
        }
        .ch-node__card--locked {
          cursor: not-allowed; opacity: 0.5;
          border-style: dashed;
        }

        .ch-node__icon {
          flex-shrink: 0; width: 36px; height: 36px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 4px; font-size: 1.2rem;
          border: 1px solid var(--s3);
        }
        .ch-node__icon--solved {
          color: var(--emerald); border-color: var(--emerald);
          background: rgba(43,224,102,0.08);
          box-shadow: 0 0 8px var(--emerald-glow);
        }
        .ch-node__icon--current {
          color: var(--ch-color); border-color: var(--ch-color);
          background: rgba(43,224,102,0.05);
          animation: pulse-glow 2s ease-in-out infinite;
        }
        .ch-node__icon--locked {
          color: var(--text-dim); border-color: var(--s3);
          background: var(--s0);
        }

        .ch-node__body { flex: 1; min-width: 0; }
        .ch-node__header {
          display: flex; justify-content: space-between;
          margin-bottom: 0.35rem;
        }
        .ch-node__id {
          font-family: var(--mono, 'Space Mono', monospace);
          font-size: 0.65rem; color: var(--text-dim);
          letter-spacing: 0.1em;
        }
        .ch-node__pts {
          font-family: var(--mono, 'Space Mono', monospace);
          font-size: 0.65rem; color: var(--text-muted);
        }
        .ch-node__title {
          font-family: var(--heading, 'Barlow Condensed', sans-serif);
          font-size: 1.15rem; color: var(--text-primary);
          margin: 0 0 0.35rem; font-weight: 600;
        }
        .ch-node__desc {
          font-family: var(--sans, 'Rajdhani', sans-serif);
          font-size: 0.85rem; color: var(--text-secondary);
          margin: 0 0 0.5rem; line-height: 1.4;
        }
        .ch-node__footer {
          display: flex; justify-content: space-between; align-items: center;
        }
        .ch-node__cat {
          font-family: var(--mono, 'Space Mono', monospace);
          font-size: 0.6rem; color: var(--text-dim);
          letter-spacing: 0.08em;
          padding: 0.15rem 0.4rem; background: var(--s2);
          border-radius: 2px;
        }
        .ch-node__status {
          font-family: var(--mono, 'Space Mono', monospace);
          font-size: 0.6rem; letter-spacing: 0.08em;
        }
        .ch-node__status--solved { color: var(--emerald); }
        .ch-node__status--current { color: var(--ch-color); }
        .ch-node__status--locked { color: var(--text-dim); }

        .ch-node__seal {
          position: absolute; inset: 0;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 0.25rem; color: var(--danger);
          font-family: var(--mono, 'Space Mono', monospace);
          font-size: 0.65rem; letter-spacing: 0.1em;
          background: rgba(5,7,5,0.7); border-radius: 4px;
        }

        /* ── Stones ── */
        .univ__stones {
          text-align: center; padding: 2rem;
          background: var(--s1); border: 1px solid var(--s3);
          border-radius: 4px;
        }
        .univ__stones-label {
          font-family: var(--mono, 'Space Mono', monospace);
          font-size: 0.7rem; color: var(--text-muted);
          letter-spacing: 0.2em; margin-bottom: 1.5rem;
        }

        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 640px) {
          .univ { padding: 1rem; }
          .univ__title { font-size: 2.5rem; }
          .univ__readout { grid-template-columns: 1fr 1fr; }
          .ch-node__card { padding: 1rem; }
        }

        @media (prefers-reduced-motion: reduce) {
          .ch-node { animation: none !important; }
          .ch-node__icon--current { animation: none; }
        }
      `}</style>
    </PageTransition>
  )
}
