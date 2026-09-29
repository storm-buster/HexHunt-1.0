import { useEffect, useState } from 'react'
import { useGame } from '../contexts/GameContext'
import { useNavigate } from 'react-router-dom'
import type { CSSProperties } from 'react'
import { api } from '../api/client'
import StoneCounter from '../components/StoneCounter'
import PageTransition from '../components/PageTransition'
import BattleworldBg from '../components/BattleworldBg'
import CommandButton from '../components/CommandButton'

const STONE_INFO = [
  { id: 'space' as const,   color: 'var(--stone-space, #007aff)',   label: 'SPACE' },
  { id: 'mind' as const,    color: 'var(--stone-mind, #ffcc00)',    label: 'MIND' },
  { id: 'reality' as const, color: 'var(--stone-reality, #ff3b30)', label: 'REALITY' },
  { id: 'power' as const,   color: 'var(--stone-power, #a2845e)',   label: 'POWER' },
  { id: 'time' as const,    color: 'var(--stone-time, #34c759)',    label: 'TIME' },
  { id: 'soul' as const,    color: 'var(--stone-soul, #ff9500)',    label: 'SOUL' },
]

export default function FinalBoss() {
  const { state } = useGame()
  const navigate = useNavigate()
  const { stones } = state

  // Final-boss completion + reveal are authoritative on the server; the flag is
  // never present in the client bundle.
  const [reveal, setReveal] = useState<string | null>(null)
  const [serverUnlocked, setServerUnlocked] = useState(false)

  useEffect(() => {
    let alive = true
    api.finalBoss()
      .then((r) => {
        if (!alive) return
        setServerUnlocked(!!r.finalBoss.unlocked)
        setReveal(r.finalBoss.reveal ?? null)
      })
      .catch(() => { /* not authed / no team — leave locked */ })
    return () => { alive = false }
  }, [state.score, stones.length])

  const allCollected = serverUnlocked || stones.length === 6

  const getCoreStatus = () => {
    if (stones.length === 0) return 'DORMANT';
    if (stones.length <= 2) return 'CHARGING';
    if (stones.length <= 4) return 'UNSTABLE';
    if (stones.length === 5) return 'CRITICAL';
    return 'ONLINE';
  }

  return (
    <PageTransition>
      <BattleworldBg variant="boss" />
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes doom-glow {
          0% { text-shadow: 0 0 10px rgba(43,224,102,0.2); }
          100% { text-shadow: 0 0 30px rgba(43,224,102,0.8), 0 0 10px rgba(43,224,102,0.5); }
        }
        @keyframes pulse {
          0% { transform: scale(0.95); opacity: 0.8; }
          100% { transform: scale(1.05); opacity: 1; }
        }
        @keyframes flicker {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes wave {
          0% { box-shadow: 0 0 0 0 rgba(43,224,102,0.4); }
          100% { box-shadow: 0 0 0 20px rgba(43,224,102,0); }
        }
        .boss-chamber {
          display: flex;
          flex-direction: column;
          align-items: center;
          min-height: 100vh;
          padding: 2rem;
          text-align: center;
          overflow-x: hidden;
        }
        .hero-subtitle {
          font-family: var(--mono-font, "Space Mono", monospace);
          color: var(--bronze, #8A6238);
          letter-spacing: 0.2em;
          font-size: 0.9rem;
          margin-bottom: 1rem;
          text-transform: uppercase;
        }
        .hero-title {
          font-family: var(--heading-font, "Barlow Condensed", sans-serif);
          font-size: clamp(3rem, 8vw, 6rem);
          color: var(--text-primary, #E8EFE9);
          margin: 0;
          letter-spacing: 0.05em;
          animation: doom-glow 3s alternate infinite;
        }
        .reactor-chamber {
          position: relative;
          width: 400px;
          height: 400px;
          margin: 3rem auto;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        @media (max-width: 768px) {
          .reactor-chamber {
            width: 300px;
            height: 300px;
          }
        }
        @media (max-width: 480px) {
          .reactor-chamber {
            width: 100%;
            height: auto;
            flex-wrap: wrap;
            gap: 1rem;
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            justify-items: center;
            padding: 2rem 0;
          }
        }
        .doom-core {
          position: absolute;
          width: 80px;
          height: 80px;
          border-radius: 50%;
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 10;
          background: radial-gradient(circle, rgba(43,224,102,0.2) 0%, transparent 70%);
        }
        .doom-core.stones-0 { background: radial-gradient(circle, #111 0%, transparent 70%); }
        .doom-core.stones-1, .doom-core.stones-2 { animation: pulse 3s infinite alternate; }
        .doom-core.stones-3, .doom-core.stones-4 { animation: pulse 1.5s infinite alternate; background: radial-gradient(circle, rgba(43,224,102,0.4) 0%, transparent 70%); }
        .doom-core.stones-5 { animation: flicker 0.2s infinite, pulse 0.5s infinite alternate; background: radial-gradient(circle, rgba(43,224,102,0.6) 0%, transparent 70%); }
        .doom-core.stones-6 { background: var(--emerald); box-shadow: 0 0 30px var(--emerald); animation: wave 1s infinite; }
        
        .core-ring {
          position: absolute;
          border-radius: 50%;
          border: 1px dashed var(--emerald-dim);
          opacity: 0;
          transition: opacity 1s;
        }
        .core-ring-1 { width: 100px; height: 100px; animation: spin 10s linear infinite; }
        .core-ring-2 { width: 140px; height: 140px; border-style: dotted; animation: spin 7s linear infinite reverse; }
        .core-ring-3 { width: 180px; height: 180px; animation: spin 5s linear infinite; }
        
        .doom-core.stones-1 .core-ring-1, .doom-core.stones-2 .core-ring-1 { opacity: 0.3; }
        .doom-core.stones-3 .core-ring-1, .doom-core.stones-4 .core-ring-1 { opacity: 0.6; }
        .doom-core.stones-3 .core-ring-2, .doom-core.stones-4 .core-ring-2 { opacity: 0.3; }
        .doom-core.stones-5 .core-ring-1, .doom-core.stones-5 .core-ring-2 { opacity: 0.8; }
        .doom-core.stones-5 .core-ring-3 { opacity: 0.4; }
        .doom-core.stones-6 .core-ring-1, .doom-core.stones-6 .core-ring-2, .doom-core.stones-6 .core-ring-3 { opacity: 1; border-color: var(--emerald); }

        .stone-wrapper {
          position: absolute;
          display: flex;
          flex-direction: column;
          align-items: center;
          z-index: 5;
          transition: transform 0.5s;
        }
        @media (max-width: 480px) {
          .stone-wrapper {
            position: relative;
            transform: none !important;
          }
        }
        .stone-crystal {
          width: 50px;
          height: 50px;
          clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
          background: #222;
          display: flex;
          justify-content: center;
          align-items: center;
          transition: all 0.5s;
        }
        .stone-crystal.collected {
          background: var(--stone-color);
          box-shadow: 0 0 20px var(--stone-color);
        }
        
        .energy-beam {
          position: absolute;
          height: 2px;
          background: var(--stone-color);
          box-shadow: 0 0 10px var(--stone-color);
          z-index: 1;
          transform-origin: 0 50%;
          opacity: 0.7;
          animation: pulse 1s infinite alternate;
        }
        @media (max-width: 480px) {
          .energy-beam { display: none; }
        }
        
        .panel--holo {
          background: rgba(10, 13, 10, 0.8);
          border: 1px solid var(--emerald);
          box-shadow: 0 0 20px rgba(43,224,102,0.2), inset 0 0 20px rgba(43,224,102,0.1);
          padding: 2rem;
          max-width: 600px;
          width: 100%;
          margin: 0 auto;
        }
        
        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
      
      <main className="boss-chamber">
        <div>
          <p className="hero-subtitle">THE FINAL BATTLEWORLD CHAMBER</p>
          <h1 className="hero-title">DOCTOR DOOM</h1>
        </div>

        <svg viewBox="0 0 160 160" aria-hidden="true" width="160" height="160" style={{ filter: 'drop-shadow(0 0 15px var(--emerald-glow, rgba(43,224,102,0.4)))', margin: '2rem 0' }}>
          <defs>
            <radialGradient id="doom-bg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--emerald-glow, rgba(43,224,102,0.4))" />
              <stop offset="100%" stopColor="rgba(0,204,102,0)" />
            </radialGradient>
          </defs>
          <circle cx="80" cy="80" r="78" fill="url(#doom-bg)" />
          <circle cx="80" cy="80" r="76" fill="none" stroke="var(--emerald, #2BE066)" strokeWidth="1" opacity="0.3" />
          <path d="M40 60 L80 45 L120 60 L120 90 L80 110 L40 90 Z" fill="none" stroke="var(--emerald, #2BE066)" strokeWidth="2" opacity="0.8" />
          <rect x="52" y="66" width="18" height="5" rx="2" fill="var(--emerald, #2BE066)" opacity="0.9" />
          <rect x="90" y="66" width="18" height="5" rx="2" fill="var(--emerald, #2BE066)" opacity="0.9" />
          <rect x="55" y="82" width="50" height="4" rx="2" fill="var(--emerald, #2BE066)" opacity="0.7" />
          <rect x="60" y="82" width="40" height="4" rx="2" fill="none" stroke="var(--emerald, #2BE066)" strokeWidth="0.5" opacity="0.5" />
          <path d="M80 45 L80 20" stroke="var(--danger, #C73A32)" strokeWidth="1.5" opacity="0.8" />
          <path d="M120 90 L140 100" stroke="var(--danger, #C73A32)" strokeWidth="1.5" opacity="0.7" />
          <path d="M40 90 L20 100" stroke="var(--danger, #C73A32)" strokeWidth="1.5" opacity="0.7" />
          <path d="M40 60 L30 40 L45 55" fill="none" stroke="var(--emerald, #2BE066)" strokeWidth="1.5" opacity="0.7" />
          <path d="M120 60 L130 40 L115 55" fill="none" stroke="var(--emerald, #2BE066)" strokeWidth="1.5" opacity="0.7" />
          <path d="M80 45 L80 25" stroke="var(--emerald, #2BE066)" strokeWidth="1.5" opacity="0.7" />
        </svg>

        <div className="reactor-chamber">
          <div className={`doom-core stones-${stones.length}`}>
            <div className="core-ring core-ring-1" />
            <div className="core-ring core-ring-2" />
            <div className="core-ring core-ring-3" />
          </div>

          {STONE_INFO.map(({ id, color, label }, index) => {
            const collected = stones.includes(id)
            const angle = (index * 60 - 90) * (Math.PI / 180)
            
            // Adjust radius using standard media query breakpoints via viewport width check would be ideal,
            // but we can rely on CSS flex/grid layout overrides for mobile instead.
            // On desktop:
            const radius = typeof window !== 'undefined' && window.innerWidth <= 768 ? 100 : 140
            const x = Math.cos(angle) * radius
            const y = Math.sin(angle) * radius
            
            const beamLength = radius - 40;
            const beamAngle = index * 60 - 90 + 180;

            return (
              <div key={id}>
                <div 
                  className="stone-wrapper"
                  style={{ transform: `translate(${x}px, ${y}px)` }}
                >
                  <div 
                    className={`stone-crystal ${collected ? 'collected' : ''}`}
                    style={{ '--stone-color': color } as CSSProperties}
                  />
                  <span style={{ marginTop: '0.5rem', fontFamily: 'var(--mono-font)', fontSize: '0.75rem', color: collected ? color : '#666' }}>
                    {label}
                  </span>
                </div>
                {collected && (
                  <div 
                    className="energy-beam"
                    style={{
                      '--stone-color': color,
                      width: `${beamLength}px`,
                      left: '50%',
                      top: '50%',
                      transform: `translate(${x}px, ${y}px) rotate(${beamAngle}deg)`
                    } as CSSProperties}
                  />
                )}
              </div>
            )
          })}
        </div>

        <div style={{ fontFamily: 'var(--mono-font)', color: 'var(--emerald)', marginBottom: '2rem', textAlign: 'center' }}>
          <div>STONES SYNCHRONIZED: {stones.length}/6</div>
          <div>CORE STATUS: [{getCoreStatus()}]</div>
        </div>

        {allCollected ? (
          <div className="panel--holo">
            <div style={{ fontFamily: 'var(--mono-font)', whiteSpace: 'pre', color: 'var(--emerald)', fontSize: '0.8rem', marginBottom: '1rem', overflowX: 'auto' }}>
              {`████████████████████████████
ALL REALITY ANCHORS SYNCHRONIZED
BATTLEWORLD CORE: 100%
DOOM PROTOCOL: AVAILABLE
OPERATIVE CLEARANCE: MAXIMUM
████████████████████████████`}
            </div>
            
            <div style={{ background: '#000', border: '1px solid var(--emerald)', padding: '1rem', marginBottom: '2rem', fontFamily: 'var(--mono-font)', color: 'var(--emerald)', fontSize: '1.2rem', boxShadow: '0 0 10px rgba(43,224,102,0.2) inset' }}>
              {reveal ?? 'AWAITING DOOM CORE AUTHORIZATION…'}
            </div>
            
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
              Congratulations, {state.participant?.name || 'Operative'}.
            </p>
            
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <CommandButton onClick={() => navigate('/hub')}>
                Return to Hub
              </CommandButton>
              <CommandButton
                variant="danger"
                onClick={() => { if (confirm('Reset all progress?')) { localStorage.clear(); navigate('/') } }}
              >
                Reset Progress
              </CommandButton>
            </div>
          </div>
        ) : (
          <div style={{ width: '100%', maxWidth: '500px' }}>
            <div style={{ background: '#111', border: '1px solid #333', height: '8px', marginBottom: '1rem', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(stones.length / 6) * 100}%`, background: 'var(--emerald)', transition: 'width 0.5s' }} />
            </div>
            <div style={{ fontFamily: 'var(--mono-font)', fontSize: '0.8rem', color: '#888', marginBottom: '2rem' }}>
              REALITY ANCHORS REMAINING: {6 - stones.length}
            </div>
            
            <StoneCounter collected={stones} />

            <div style={{ marginTop: '2rem' }}>
              <CommandButton variant="ghost" onClick={() => navigate('/hub')}>
                ← RETURN TO COMMAND
              </CommandButton>
            </div>
          </div>
        )}

        <p style={{
          marginTop: '4rem', fontFamily: 'var(--mono-font)', fontSize: '0.8rem',
          color: 'var(--text-muted)', opacity: 0.6,
          maxWidth: '500px', fontStyle: 'italic'
        }}>
          "You think yourself a god. But gods die."<br/>
          <span style={{ fontSize: '0.7rem', marginTop: '0.5rem', display: 'block' }}>— Doctor Doom, Avengers: Doomsday</span>
        </p>

      </main>
    </PageTransition>
  )
}
