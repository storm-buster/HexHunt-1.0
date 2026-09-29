import { useEffect, useRef, useState } from 'react'

export default function DoomCursor() {
  const cursorRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const [clicking, setClicking] = useState(false)
  const [hovering, setHovering] = useState(false)
  const posRef = useRef({ x: -100, y: -100 })
  const rafRef = useRef<number | null>(null)
  const ringPos = useRef({ x: -100, y: -100 })

  useEffect(() => {
    // Check for coarse pointer (mobile) or reduced motion
    const isTouch = window.matchMedia('(pointer: coarse)').matches
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (isTouch || reducedMotion) return

    document.body.style.cursor = 'none'

    const handleMove = (e: MouseEvent) => {
      posRef.current = { x: e.clientX, y: e.clientY }
    }

    const handleDown = () => setClicking(true)
    const handleUp = () => setClicking(false)

    const handleOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const interactive = target.closest('button, a, [role="button"], input, select, textarea, .command-btn, .universe-card, .challenge-card, .portal__btn, .portal__btn--return, .portal__btn--back')
      setHovering(!!interactive)
    }

    // Smooth follow loop
    const animate = () => {
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate(${posRef.current.x}px, ${posRef.current.y}px)`
      }
      if (ringRef.current) {
        // Ring follows with slight lag
        ringPos.current.x += (posRef.current.x - ringPos.current.x) * 0.15
        ringPos.current.y += (posRef.current.y - ringPos.current.y) * 0.15
        ringRef.current.style.transform = `translate(${ringPos.current.x}px, ${ringPos.current.y}px)`
      }
      rafRef.current = requestAnimationFrame(animate)
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mousedown', handleDown)
    document.addEventListener('mouseup', handleUp)
    document.addEventListener('mouseover', handleOver)
    rafRef.current = requestAnimationFrame(animate)

    return () => {
      document.body.style.cursor = ''
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mousedown', handleDown)
      document.removeEventListener('mouseup', handleUp)
      document.removeEventListener('mouseover', handleOver)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // Don't render on touch devices
  if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) return null

  return (
    <>
      {/* Reticle dot */}
      <div
        ref={cursorRef}
        className={`doom-cursor ${clicking ? 'doom-cursor--click' : ''} ${hovering ? 'doom-cursor--hover' : ''}`}
        aria-hidden="true"
      />
      {/* Outer ring (follows with lag) */}
      <div
        ref={ringRef}
        className={`doom-cursor-ring ${hovering ? 'doom-cursor-ring--hover' : ''} ${clicking ? 'doom-cursor-ring--click' : ''}`}
        aria-hidden="true"
      />

      <style>{`
        .doom-cursor, .doom-cursor-ring {
          position: fixed;
          top: 0; left: 0;
          pointer-events: none;
          z-index: 999999;
          will-change: transform;
        }
        .doom-cursor {
          width: 4px; height: 4px;
          margin-left: -2px; margin-top: -2px;
          background: var(--emerald, #2BE066);
          border-radius: 50%;
          box-shadow: 0 0 6px var(--emerald-glow, rgba(43,224,102,0.5));
          transition: width 0.2s, height 0.2s, margin 0.2s, box-shadow 0.2s;
        }
        .doom-cursor::before, .doom-cursor::after {
          content: '';
          position: absolute;
          background: var(--emerald, #2BE066);
          opacity: 0.4;
        }
        .doom-cursor::before {
          width: 12px; height: 1px;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
        }
        .doom-cursor::after {
          width: 1px; height: 12px;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
        }
        .doom-cursor--hover {
          width: 8px; height: 8px;
          margin-left: -4px; margin-top: -4px;
          box-shadow: 0 0 12px var(--emerald-glow, rgba(43,224,102,0.6));
        }
        .doom-cursor--click {
          background: var(--emerald-bright, #39F27A);
          box-shadow: 0 0 20px var(--emerald-glow-strong, rgba(43,224,102,0.8));
        }

        .doom-cursor-ring {
          width: 28px; height: 28px;
          margin-left: -14px; margin-top: -14px;
          border: 1px solid var(--emerald, #2BE066);
          border-radius: 50%;
          opacity: 0.25;
          transition: width 0.3s ease-out, height 0.3s ease-out, margin 0.3s ease-out, opacity 0.3s, border-color 0.3s;
        }
        .doom-cursor-ring--hover {
          width: 44px; height: 44px;
          margin-left: -22px; margin-top: -22px;
          opacity: 0.4;
          border-color: var(--emerald-bright, #39F27A);
        }
        .doom-cursor-ring--click {
          width: 56px; height: 56px;
          margin-left: -28px; margin-top: -28px;
          opacity: 0;
        }

        @media (pointer: coarse) {
          .doom-cursor, .doom-cursor-ring { display: none !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .doom-cursor, .doom-cursor-ring { display: none !important; }
        }
      `}</style>
    </>
  )
}
