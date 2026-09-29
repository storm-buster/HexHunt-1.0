import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'
import PageTransition from '../components/PageTransition'
import BattleworldBg from '../components/BattleworldBg'
import CommandButton from '../components/CommandButton'
import BattleworldCore from '../components/BattleworldCore'

// Universe SVG icons
function WebverseIcon() {
  return (
    <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
      <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <circle cx="24" cy="24" r="14" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      <circle cx="24" cy="4" r="2.5" fill="currentColor" opacity="0.8" />
      <circle cx="24" cy="44" r="2.5" fill="currentColor" opacity="0.8" />
      <circle cx="4" cy="24" r="2.5" fill="currentColor" opacity="0.8" />
      <circle cx="44" cy="24" r="2.5" fill="currentColor" opacity="0.8" />
      <circle cx="10" cy="10" r="2" fill="currentColor" opacity="0.5" />
      <circle cx="38" cy="10" r="2" fill="currentColor" opacity="0.5" />
      <circle cx="10" cy="38" r="2" fill="currentColor" opacity="0.5" />
      <circle cx="38" cy="38" r="2" fill="currentColor" opacity="0.5" />
      <line x1="24" y1="6.5" x2="24" y2="18" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <line x1="24" y1="30" x2="24" y2="41.5" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <line x1="6.5" y1="24" x2="18" y2="24" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <line x1="30" y1="24" x2="41.5" y2="24" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <circle cx="24" cy="24" r="5" fill="currentColor" opacity="0.6" />
      <circle cx="24" cy="24" r="3" fill="currentColor" opacity="0.9" />
    </svg>
  )
}

function OsintverseIcon() {
  return (
    <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
      <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <circle cx="24" cy="24" r="14" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      <line x1="24" y1="24" x2="24" y2="4" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
      <path d="M24 24 L24 4 A20 20 0 0 1 43.3 34 Z" fill="currentColor" opacity="0.15" />
      <line x1="24" y1="14" x2="24" y2="18" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <line x1="24" y1="30" x2="24" y2="34" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <line x1="14" y1="24" x2="18" y2="24" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <line x1="30" y1="24" x2="34" y2="24" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <circle cx="24" cy="24" r="3" fill="currentColor" opacity="0.8" />
    </svg>
  )
}

function DarknetIcon() {
  return (
    <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
      <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <rect x="10" y="10" width="6" height="6" fill="currentColor" opacity="0.3" />
      <rect x="32" y="10" width="6" height="6" fill="currentColor" opacity="0.2" />
      <rect x="10" y="32" width="6" height="6" fill="currentColor" opacity="0.2" />
      <rect x="32" y="32" width="6" height="6" fill="currentColor" opacity="0.3" />
      <line x1="24" y1="13" x2="13" y2="13" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      <line x1="24" y1="13" x2="35" y2="13" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      <line x1="24" y1="35" x2="13" y2="35" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      <line x1="24" y1="35" x2="35" y2="35" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      <line x1="13" y1="13" x2="13" y2="35" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      <line x1="35" y1="13" x2="35" y2="35" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      <rect x="20" y="20" width="8" height="8" fill="currentColor" opacity="0.7" />
      <rect x="22" y="22" width="4" height="4" fill="currentColor" opacity="0.95" />
    </svg>
  )
}

export default function Hub() {
  const { state, isUniverseUnlocked } = useGame()
  const navigate = useNavigate()

  if (state.loading) return null
  if (!state.participant) {
    navigate('/auth')
    return null
  }
  if (!state.team) {
    navigate('/team')
    return null
  }

  const universes = [
    { id: 'webverse' as const, name: 'WEBVERSE', Icon: WebverseIcon, color: 'var(--wv-primary)', challenges: 3 },
    { id: 'osintverse' as const, name: 'OSINTVERSE', Icon: OsintverseIcon, color: 'var(--os-primary)', challenges: 3 },
    { id: 'darknet' as const, name: 'DARKNET', Icon: DarknetIcon, color: 'var(--dn-primary)', challenges: 6 },
  ]

  const unlockedSectorsCount = universes.filter(u => isUniverseUnlocked(u.id)).length;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    
    const rotX = Math.max(-8, Math.min(8, -(y / rect.height) * 16));
    const rotY = Math.max(-8, Math.min(8, (x / rect.width) * 16));
    
    e.currentTarget.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.transform = `rotateX(0deg) rotateY(0deg)`;
  };

  return (
    <PageTransition>
      <BattleworldBg variant="hub" />
      
      <style>{`
        .hub-container {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          padding: 2rem 0;
          overflow-x: hidden;
        }
        
        .hub-header {
          text-align: center;
          margin-bottom: 2rem;
          padding: 0 1rem;
        }

        .map-area {
          position: relative;
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 600px;
          margin: 0 auto;
          width: 100%;
          max-width: 1200px;
        }

        .core-container {
          width: 300px;
          height: 300px;
          z-index: 10;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }

        .svg-lines {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 1;
          pointer-events: none;
        }

        .sector-node-wrapper {
          position: absolute;
          z-index: 20;
          transform: translate(-50%, -50%);
          perspective: 1000px;
          width: 280px;
        }

        .node-webverse { top: 20%; left: 50%; }
        .node-osintverse { top: 75%; left: 25%; }
        .node-darknet { top: 75%; left: 75%; }
        
        .sector-card {
          background: rgba(10, 15, 12, 0.9);
          border: 1px solid var(--s3);
          padding: 1.5rem;
          border-radius: 4px;
          box-shadow: 0 0 20px rgba(0,0,0,0.8);
          transition: transform 0.2s ease-out, border-color 0.3s;
          transform-style: preserve-3d;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        
        .sector-card.unlocked {
          border-color: var(--emerald);
          cursor: pointer;
        }
        .sector-card.unlocked:hover {
          box-shadow: 0 0 30px rgba(0, 255, 127, 0.2);
        }
        
        .sector-card.locked {
          border-color: var(--danger);
          pointer-events: none;
        }

        .locked-overlay {
          position: absolute;
          inset: 0;
          background: rgba(5,7,5,0.9);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 2;
          padding: 1rem;
        }

        .scan-line {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 2px;
          background: var(--danger);
          opacity: 0.5;
          box-shadow: 0 0 10px var(--danger);
          animation: scan 3s infinite linear;
        }

        @keyframes scan {
          0% { top: 0; }
          100% { top: 100%; }
        }

        .glitch-text {
          position: absolute;
          inset: 0;
          font-family: var(--mono-font);
          font-size: 0.6rem;
          color: var(--danger);
          opacity: 0.15;
          word-break: break-all;
          line-height: 1;
          overflow: hidden;
          padding: 0.5rem;
          z-index: 0;
        }

        .connection-line {
          stroke-width: 2;
          fill: none;
        }
        .connection-line.locked {
          stroke: var(--s3);
          stroke-dasharray: 4 4;
          opacity: 0.5;
        }
        .connection-line.unlocked {
          stroke: var(--emerald);
          filter: drop-shadow(0 0 5px var(--emerald));
          stroke-dasharray: 10 10;
          animation: energy-sweep 2s linear infinite;
        }
        
        @keyframes energy-sweep {
          to { stroke-dashoffset: -20; }
        }
        
        @media (max-width: 768px) {
          .map-area {
            flex-direction: column;
            height: auto;
            min-height: auto;
            padding: 2rem;
            gap: 2rem;
          }
          .svg-lines { display: none; }
          .core-container {
            position: relative;
            top: auto;
            left: auto;
            transform: none;
            width: 200px;
            height: 200px;
            margin: 0 auto;
          }
          .sector-node-wrapper {
            position: relative;
            top: auto !important;
            left: auto !important;
            transform: none !important;
            width: 100%;
            max-width: 350px;
            margin: 0 auto;
          }
        }

        @media (max-width: 480px) {
          .core-container { display: none; }
        }
      `}</style>

      <main className="hub-container">
        <header className="hub-header">
          <p style={{ fontFamily: 'var(--mono-font)', fontSize: '0.8rem', color: 'var(--bronze)', letterSpacing: '0.2em', marginBottom: '0.5rem', opacity: 0.9 }}>
            BATTLEWORLD // SECTOR 616
          </p>
          <p style={{ fontFamily: 'var(--mono-font)', fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.15em', marginBottom: '1.5rem' }}>
            — classified —
          </p>
          <h1 style={{ color: 'var(--emerald-bright)', fontFamily: 'var(--heading-font)', fontWeight: 800, fontSize: '2.5rem', textShadow: '0 0 20px var(--emerald-glow)', margin: '0' }}>
            BATTLEWORLD COMMAND CENTER
          </h1>
          <div style={{ 
            display: 'inline-flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap',
            fontFamily: 'var(--mono-font)', fontSize: '0.8rem', color: 'var(--text-primary)', 
            marginTop: '2rem', background: 'var(--s2)', padding: '0.75rem 1.5rem', 
            borderRadius: '4px', border: '1px solid var(--deep-green)',
            boxShadow: '0 0 15px rgba(11, 61, 34, 0.5)'
          }}>
            <span>MULTIVERSE INTEGRITY: 42%</span>
            <span style={{ color: 'var(--emerald)' }}>STONES: {state.stones.length}/6</span>
            <span>SECTORS: {unlockedSectorsCount}/3</span>
          </div>
        </header>

        <div className="map-area">
          <svg className="svg-lines" preserveAspectRatio="none">
            {/* Center is at 50% 50% */}
            {/* Webverse is at 50% 20% */}
            <line x1="50%" y1="20%" x2="50%" y2="50%" className={`connection-line ${isUniverseUnlocked('webverse') ? 'unlocked' : 'locked'}`} />
            {/* Osintverse is at 25% 75% */}
            <line x1="25%" y1="75%" x2="50%" y2="50%" className={`connection-line ${isUniverseUnlocked('osintverse') ? 'unlocked' : 'locked'}`} />
            {/* Darknet is at 75% 75% */}
            <line x1="75%" y1="75%" x2="50%" y2="50%" className={`connection-line ${isUniverseUnlocked('darknet') ? 'unlocked' : 'locked'}`} />
          </svg>

          <div className="core-container">
            <BattleworldCore stoneCount={state.stones.length} />
          </div>

          {universes.map((u) => {
            const unlocked = isUniverseUnlocked(u.id);
            const Icon = u.Icon;
            
            return (
              <div key={u.id} className={`sector-node-wrapper node-${u.id}`}>
                <div 
                  className={`sector-card ${unlocked ? 'unlocked' : 'locked'}`}
                  onMouseMove={unlocked ? handleMouseMove : undefined}
                  onMouseLeave={unlocked ? handleMouseLeave : undefined}
                  onClick={() => unlocked && navigate(`/universe/${u.id}`)}
                  data-sfx={unlocked ? "hover" : undefined}
                  style={{ color: u.color }}
                >
                  <div style={{ marginBottom: '1rem' }}>
                    <Icon />
                  </div>
                  <h2 style={{ fontFamily: 'var(--heading-font)', fontSize: '1.5rem', margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>
                    {u.name}
                  </h2>
                  
                  <div style={{ fontFamily: 'var(--mono-font)', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', opacity: 0.8 }}>
                    <div>NODES: 0{u.challenges} | THREAT: LOW</div>
                    <div>INTEGRITY: 81%</div>
                  </div>

                  <div style={{ width: '100%', borderTop: '1px solid var(--s3)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--mono-font)', fontSize: '0.75rem' }}>
                      STATUS: <span style={{ color: unlocked ? 'var(--emerald)' : 'var(--danger)' }}>{unlocked ? 'ONLINE' : 'SEALED'}</span>
                    </span>
                    {unlocked && (
                      <CommandButton variant="primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.7rem' }}>
                        ENTER SECTOR
                      </CommandButton>
                    )}
                  </div>

                  {!unlocked && (
                    <div className="locked-overlay">
                      <div className="scan-line"></div>
                      <div className="glitch-text">
                        {Array.from({length: 200}).map(() => Math.random().toString(36)[2]).join('')}
                      </div>
                      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="var(--danger)" strokeWidth="1.5" style={{ zIndex: 3, marginBottom: '0.5rem' }}>
                        <rect x="3" y="11" width="18" height="11" rx="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      <h3 style={{ fontFamily: 'var(--heading-font)', color: 'var(--danger)', margin: '0 0 0.5rem 0', letterSpacing: '0.1em', zIndex: 3 }}>
                        SECTOR SEALED
                      </h3>
                      <div style={{ fontFamily: 'var(--mono-font)', fontSize: '0.7rem', color: 'var(--text-muted)', zIndex: 3, textAlign: 'center' }}>
                        <div>ACCESS LEVEL: RESTRICTED</div>
                        <div>REQUIRED: PREVIOUS SECTOR CLEAR</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <footer style={{
          textAlign: 'center', marginTop: '3rem', fontSize: '0.75rem',
          color: 'var(--text-muted)', fontFamily: 'var(--mono-font)', letterSpacing: '0.15em',
        }}>
          <p style={{ marginBottom: '0.5rem' }}>— DOCTOR DOOM'S BATTLEWORLD —</p>
        </footer>
      </main>
    </PageTransition>
  )
}
