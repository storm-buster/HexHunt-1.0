import type { CSSProperties } from 'react'
import type { Stone } from '../data/challenges'

const STONES: { id: Stone; emoji: string; label: string }[] = [
  { id: 'space',   emoji: '🌀', label: 'Space Stone' },
  { id: 'mind',   emoji: '🧠', label: 'Mind Stone' },
  { id: 'reality', emoji: '🔴', label: 'Reality Stone' },
  { id: 'power',  emoji: '💜', label: 'Power Stone' },
  { id: 'time',   emoji: '⏱️', label: 'Time Stone' },
  { id: 'soul',   emoji: '🧡', label: 'Soul Stone' },
]

interface Props {
  collected: Stone[]
  compact?: boolean
}

export default function StoneCounter({ collected, compact = false }: Props) {
  return (
    <>
      <div 
        className={`stone-counter ${compact ? 'stone-counter--compact' : ''}`} 
        role="img" 
        aria-label={`${collected.length} of 6 Infinity Stones collected`}
      >
        {STONES.map(({ id, emoji, label }) => {
          const isCollected = collected.includes(id)
          return (
            <div
              key={id}
              className={`stone-crystal ${isCollected ? 'stone-crystal--collected' : 'stone-crystal--dormant'}`}
              style={{ '--stone-color': `var(--stone-${id}, #fff)` } as CSSProperties}
              title={`${label}${isCollected ? ' — Collected' : ''}`}
              aria-label={label}
            >
              <div className="stone-crystal__inner" />
            </div>
          )
        })}
      </div>
      <style>{`
        .stone-counter {
          display: flex;
          gap: 16px;
          align-items: center;
          padding: 12px;
          background: rgba(10, 13, 10, 0.6);
          border: 1px solid rgba(138, 98, 56, 0.2);
          border-radius: 4px;
        }

        .stone-counter--compact {
          gap: 8px;
          padding: 6px;
        }

        .stone-crystal {
          position: relative;
          width: 24px;
          height: 32px;
          clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .stone-counter--compact .stone-crystal {
          width: 16px;
          height: 22px;
        }

        .stone-crystal__inner {
          position: absolute;
          inset: 1px;
          clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
          background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 50%, rgba(0,0,0,0.5) 100%);
        }

        .stone-crystal--dormant {
          background: var(--s2, #101510);
          opacity: 0.5;
          filter: grayscale(100%) brightness(0.5);
          box-shadow: inset 0 0 10px rgba(0,0,0,0.8);
        }
        
        .stone-crystal--dormant .stone-crystal__inner {
          background-color: #1a1a1a;
        }

        .stone-crystal--collected {
          background: var(--stone-color);
          box-shadow: 
            0 0 15px var(--stone-color),
            inset 0 0 20px rgba(255, 255, 255, 0.5);
          animation: crystalPulse 2s infinite alternate;
        }

        .stone-crystal--collected .stone-crystal__inner {
          background-color: var(--stone-color);
          background-image: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.8) 0%, transparent 60%);
        }

        @keyframes crystalPulse {
          0% { filter: brightness(1) drop-shadow(0 0 5px var(--stone-color)); }
          100% { filter: brightness(1.3) drop-shadow(0 0 12px var(--stone-color)); }
        }
      `}</style>
    </>
  )
}
