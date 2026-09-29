import { useNavigate } from 'react-router-dom'
import { useGame } from '../contexts/GameContext'
import StoneCounter from './StoneCounter'
import CommandButton from './CommandButton'

export default function Nav() {
  const { state, logout } = useGame()
  const navigate = useNavigate()

  if (!state.participant) return null

  return (
    <>
      <nav className="doom-nav">
        <div className="doom-nav__container">
          <div className="doom-nav__logo" onClick={() => navigate('/hub')}>
            ◆ DOOM // DAY
          </div>
          
          <div className="doom-nav__operative">
            <span className="doom-nav__label">OPERATIVE:</span>
            <span className="doom-nav__name">{state.participant.name}</span>
            <span className="doom-nav__status-dot" />
            <span className="doom-nav__status-text">ONLINE</span>
          </div>
          
          <div className="doom-nav__stones">
            <StoneCounter collected={state.stones} compact />
          </div>
          
          <div className="doom-nav__actions">
            {state.hidden?.available && !state.hidden?.attempted && (
              <CommandButton
                variant="danger"
                size="sm"
                onClick={() => navigate('/hidden')}
              >
                ⚠ HIDDEN
              </CommandButton>
            )}
            <CommandButton 
              variant="ghost" 
              size="sm"
              onClick={async () => {
                if (confirm('Log out of this operative session?')) {
                  await logout()
                  navigate('/')
                }
              }}
            >
              ⎋
            </CommandButton>
          </div>
        </div>
        <div className="doom-nav__energy-line" />
      </nav>

      <style>{`
        .doom-nav {
          position: sticky;
          top: 0;
          z-index: 100;
          background: var(--s1, #0A0D0A);
          border-bottom: 1px solid rgba(138, 98, 56, 0.3);
          font-family: var(--mono-font, 'Space Mono', monospace);
          text-transform: uppercase;
        }

        .doom-nav__container {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1.5rem;
          max-width: 1400px;
          margin: 0 auto;
        }

        .doom-nav__logo {
          font-family: var(--heading-font, 'Barlow Condensed', sans-serif);
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--emerald, #2BE066);
          text-shadow: 0 0 10px var(--emerald-glow, rgba(43, 224, 102, 0.4));
          cursor: pointer;
          letter-spacing: 0.05em;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .doom-nav__operative {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 0.875rem;
          color: var(--text-secondary, #AAB8AE);
          background: rgba(16, 21, 16, 0.8);
          padding: 0.25rem 1rem;
          border: 1px solid rgba(43, 224, 102, 0.2);
          border-radius: 2px;
        }

        .doom-nav__label {
          color: var(--text-muted, #66736A);
        }

        .doom-nav__name {
          color: var(--text-primary, #E8EFE9);
          font-weight: bold;
        }

        .doom-nav__status-dot {
          width: 6px;
          height: 6px;
          background: var(--emerald, #2BE066);
          border-radius: 50%;
          box-shadow: 0 0 8px var(--emerald, #2BE066);
          animation: pulse 2s infinite;
        }

        .doom-nav__status-text {
          color: var(--emerald, #2BE066);
          font-size: 0.75rem;
        }

        .doom-nav__stones {
          display: flex;
          align-items: center;
        }

        .doom-nav__actions {
          display: flex;
          align-items: center;
        }

        .doom-nav__energy-line {
          height: 2px;
          width: 100%;
          background: linear-gradient(90deg, 
            transparent 0%, 
            var(--emerald, #2BE066) 50%, 
            transparent 100%
          );
          background-size: 200% 100%;
          animation: energySlide 3s linear infinite;
          opacity: 0.5;
        }

        @keyframes energySlide {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }

        @keyframes pulse {
          0% { opacity: 0.5; }
          50% { opacity: 1; }
          100% { opacity: 0.5; }
        }

        @media (max-width: 768px) {
          .doom-nav__container {
            padding: 0.5rem;
            flex-wrap: wrap;
            gap: 0.5rem;
          }
          
          .doom-nav__operative {
            order: 3;
            width: 100%;
            justify-content: center;
          }
          
          .doom-nav__logo {
            font-size: 1.25rem;
          }
        }
      `}</style>
    </>
  )
}
