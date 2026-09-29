import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
}

export default function PageTransition({ children, className = '' }: Props) {
  return (
    <>
      <div className={`page-transition ${className}`}>
        <div className="page-transition__scanline" />
        <div className="page-transition__content">
          {children}
        </div>
      </div>
      <style>{`
        .page-transition {
          position: relative;
          width: 100%;
          min-height: 100vh;
          overflow: hidden;
        }
        
        .page-transition__content {
          animation: pageFadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          opacity: 0;
          transform: translateY(20px);
        }
        
        .page-transition__scanline {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 2px;
          background: var(--emerald, #2BE066);
          box-shadow: 0 0 10px var(--emerald, #2BE066), 0 0 20px var(--emerald, #2BE066);
          opacity: 0;
          z-index: 9999;
          pointer-events: none;
          animation: scanline 1.5s ease-in-out forwards;
        }
        
        @keyframes pageFadeIn {
          0% {
            opacity: 0;
            transform: translateY(20px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes scanline {
          0% {
            top: 0;
            opacity: 0;
          }
          10% {
            opacity: 0.8;
          }
          90% {
            opacity: 0.8;
          }
          100% {
            top: 100%;
            opacity: 0;
          }
        }
      `}</style>
    </>
  )
}
