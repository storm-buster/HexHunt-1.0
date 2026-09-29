import type { FC } from 'react'

interface Props {
  variant?: 'default' | 'hub' | 'universe' | 'challenge' | 'portal' | 'boss' | 'webverse' | 'osintverse' | 'darknet'
}

const BattleworldBg: FC<Props> = ({ variant = 'default' }) => {
  return (
    <>
      <div className={`bw-bg bw-bg--${variant}`} aria-hidden="true">
        <div className="bw-bg__grid" />
        <div className="bw-bg__glow" />
        <div className="bw-bg__scanlines" />
        <div className="bw-bg__vignette" />
        {/* Dimensional particles — CSS animated pseudo-elements */}
        <div className="bw-bg__particles" />
      </div>
      <style>{`
        .bw-bg {
          position: fixed;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          background: var(--s0, #050705);
          overflow: hidden;
        }

        /* ── Grid Layer ── */
        .bw-bg__grid {
          position: absolute; inset: 0;
          opacity: 0.03;
        }
        .bw-bg--default .bw-bg__grid,
        .bw-bg--hub .bw-bg__grid {
          background:
            repeating-linear-gradient(90deg, var(--bronze, #8A6238) 0px, var(--bronze, #8A6238) 1px, transparent 1px, transparent 60px),
            repeating-linear-gradient(0deg, var(--bronze, #8A6238) 0px, var(--bronze, #8A6238) 1px, transparent 1px, transparent 60px);
        }
        .bw-bg--hub .bw-bg__grid {
          opacity: 0.04;
          background:
            repeating-linear-gradient(90deg, var(--emerald, #2BE066) 0px, var(--emerald, #2BE066) 1px, transparent 1px, transparent 80px),
            repeating-linear-gradient(0deg, var(--emerald, #2BE066) 0px, var(--emerald, #2BE066) 1px, transparent 1px, transparent 80px);
        }
        .bw-bg--webverse .bw-bg__grid {
          opacity: 0.05;
          background:
            repeating-linear-gradient(90deg, var(--wv-primary, #2BE066) 0px, var(--wv-primary, #2BE066) 1px, transparent 1px, transparent 24px),
            repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(43,224,102,0.03) 3px, rgba(43,224,102,0.03) 4px);
          animation: matrixScroll 20s linear infinite;
        }
        .bw-bg--osintverse .bw-bg__grid {
          opacity: 0.04;
          background:
            repeating-linear-gradient(90deg, var(--os-primary, #C9A45C) 0px, var(--os-primary, #C9A45C) 1px, transparent 1px, transparent 50px),
            repeating-linear-gradient(0deg, var(--os-primary, #C9A45C) 0px, var(--os-primary, #C9A45C) 1px, transparent 1px, transparent 50px);
        }
        .bw-bg--darknet .bw-bg__grid {
          opacity: 0.04;
          background:
            repeating-linear-gradient(90deg, var(--dn-primary, #C73A32) 0px, var(--dn-primary, #C73A32) 1px, transparent 1px, transparent 40px),
            repeating-linear-gradient(0deg, var(--dn-primary, #C73A32) 0px, var(--dn-primary, #C73A32) 1px, transparent 1px, transparent 40px);
          animation: glitchGrid 8s steps(1) infinite;
        }
        .bw-bg--portal .bw-bg__grid {
          opacity: 0.06;
          background:
            repeating-linear-gradient(45deg, rgba(43,224,102,0.04) 0px, rgba(43,224,102,0.04) 1px, transparent 1px, transparent 30px),
            repeating-linear-gradient(-45deg, rgba(43,224,102,0.04) 0px, rgba(43,224,102,0.04) 1px, transparent 1px, transparent 30px);
          animation: portalFracture 3s ease-in-out infinite;
        }
        .bw-bg--boss .bw-bg__grid {
          opacity: 0.05;
          background:
            repeating-linear-gradient(90deg, rgba(199,58,50,0.06) 0px, rgba(199,58,50,0.06) 1px, transparent 1px, transparent 50px),
            repeating-linear-gradient(0deg, rgba(43,224,102,0.04) 0px, rgba(43,224,102,0.04) 1px, transparent 1px, transparent 50px);
        }
        .bw-bg--challenge .bw-bg__grid,
        .bw-bg--universe .bw-bg__grid {
          opacity: 0.03;
          background:
            repeating-linear-gradient(90deg, var(--emerald, #2BE066) 0px, var(--emerald, #2BE066) 1px, transparent 1px, transparent 40px),
            repeating-linear-gradient(0deg, var(--bronze, #8A6238) 0px, var(--bronze, #8A6238) 1px, transparent 1px, transparent 40px);
        }

        /* ── Atmospheric Glow Layer ── */
        .bw-bg__glow {
          position: absolute; inset: 0;
        }
        .bw-bg--default .bw-bg__glow,
        .bw-bg--challenge .bw-bg__glow,
        .bw-bg--universe .bw-bg__glow {
          background: radial-gradient(ellipse 70% 50% at 50% 30%, rgba(43,224,102,0.04), transparent 70%);
        }
        .bw-bg--hub .bw-bg__glow {
          background:
            radial-gradient(ellipse 50% 40% at 50% 45%, rgba(43,224,102,0.07), transparent 60%),
            radial-gradient(ellipse 30% 25% at 50% 45%, rgba(43,224,102,0.04), transparent 50%);
          animation: coreBreath 6s ease-in-out infinite;
        }
        .bw-bg--webverse .bw-bg__glow {
          background:
            radial-gradient(ellipse 60% 50% at 50% 30%, rgba(43,224,102,0.06), transparent 60%),
            radial-gradient(ellipse 40% 30% at 80% 80%, rgba(91,127,255,0.04), transparent 50%);
        }
        .bw-bg--osintverse .bw-bg__glow {
          background:
            radial-gradient(ellipse 60% 50% at 50% 30%, rgba(201,164,92,0.06), transparent 60%);
        }
        .bw-bg--osintverse .bw-bg__glow::before {
          content: '';
          position: absolute;
          width: 300px; height: 300px;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          background: conic-gradient(from 0deg, transparent 0deg, rgba(201,164,92,0.08) 30deg, transparent 60deg);
          animation: radarSweep 4s linear infinite;
        }
        .bw-bg--darknet .bw-bg__glow {
          background:
            radial-gradient(ellipse 60% 50% at 50% 50%, rgba(199,58,50,0.06), transparent 60%),
            radial-gradient(ellipse 30% 40% at 20% 80%, rgba(199,58,50,0.04), transparent 50%);
        }
        .bw-bg--portal .bw-bg__glow {
          background:
            radial-gradient(circle at 50% 50%, rgba(43,224,102,0.1), transparent 50%);
          animation: portalPulse 2s ease-in-out infinite;
        }
        .bw-bg--boss .bw-bg__glow {
          background:
            radial-gradient(ellipse 40% 35% at 50% 45%, rgba(199,58,50,0.08), transparent 50%),
            radial-gradient(ellipse 60% 50% at 50% 45%, rgba(43,224,102,0.04), transparent 70%);
        }

        /* ── Scanlines ── */
        .bw-bg__scanlines {
          position: absolute; inset: 0;
          background: repeating-linear-gradient(
            0deg,
            transparent 0px,
            transparent 2px,
            rgba(0,0,0,0.07) 2px,
            rgba(0,0,0,0.07) 4px
          );
          pointer-events: none;
        }
        .bw-bg--darknet .bw-bg__scanlines {
          background: repeating-linear-gradient(
            0deg,
            transparent 0px,
            transparent 1px,
            rgba(199,58,50,0.02) 1px,
            rgba(199,58,50,0.02) 3px
          );
        }

        /* ── Vignette ── */
        .bw-bg__vignette {
          position: absolute; inset: 0;
          box-shadow: inset 0 0 150px rgba(0,0,0,0.8), inset 0 0 300px rgba(0,0,0,0.4);
          pointer-events: none;
        }
        .bw-bg--boss .bw-bg__vignette {
          box-shadow: inset 0 0 200px rgba(0,0,0,0.9), inset 0 0 400px rgba(0,0,0,0.5);
        }

        /* ── Ambient Particles (CSS pseudo-elements) ── */
        .bw-bg__particles {
          position: absolute; inset: 0;
        }
        .bw-bg--webverse .bw-bg__particles::before {
          content: '';
          position: absolute;
          top: 0; left: 0;
          width: 100%; height: 200%;
          background-image:
            radial-gradient(1px 1px at 10% 15%, rgba(43,224,102,0.3), transparent),
            radial-gradient(1px 1px at 30% 45%, rgba(43,224,102,0.2), transparent),
            radial-gradient(1px 1px at 50% 75%, rgba(43,224,102,0.3), transparent),
            radial-gradient(1px 1px at 70% 25%, rgba(43,224,102,0.2), transparent),
            radial-gradient(1px 1px at 90% 85%, rgba(43,224,102,0.3), transparent),
            radial-gradient(1px 1px at 20% 65%, rgba(43,224,102,0.15), transparent),
            radial-gradient(1px 1px at 60% 35%, rgba(43,224,102,0.2), transparent),
            radial-gradient(1px 1px at 80% 55%, rgba(43,224,102,0.25), transparent);
          animation: matrixFall 12s linear infinite;
        }
        .bw-bg--osintverse .bw-bg__particles::before {
          content: '';
          position: absolute;
          width: 6px; height: 6px;
          top: 30%; left: 60%;
          background: var(--os-primary, #C9A45C);
          border-radius: 50%;
          opacity: 0.3;
          box-shadow:
            -120px 40px 0 0 rgba(201,164,92,0.15),
            80px -60px 0 0 rgba(201,164,92,0.2),
            -200px -100px 0 0 rgba(201,164,92,0.1),
            160px 120px 0 0 rgba(201,164,92,0.15),
            -40px 180px 0 0 rgba(201,164,92,0.12);
          animation: radarBlips 4s ease-in-out infinite;
        }
        .bw-bg--darknet .bw-bg__particles::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, rgba(199,58,50,0.4), transparent);
          animation: corruptScan 3s linear infinite;
        }
        .bw-bg--darknet .bw-bg__particles::after {
          content: '';
          position: absolute;
          inset: 0;
          background:
            linear-gradient(90deg, transparent 49.8%, rgba(199,58,50,0.03) 49.8%, rgba(199,58,50,0.03) 50.2%, transparent 50.2%);
          animation: glitchTear 6s steps(1) infinite;
        }

        /* ── Dimensional Animations ── */
        @keyframes matrixScroll {
          from { transform: translateY(0); }
          to { transform: translateY(24px); }
        }
        @keyframes matrixFall {
          from { transform: translateY(-50%); }
          to { transform: translateY(0); }
        }
        @keyframes radarSweep {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes radarBlips {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
        @keyframes glitchGrid {
          0%, 90%, 100% { opacity: 0.04; transform: none; }
          91% { opacity: 0.08; transform: translateX(2px); }
          93% { opacity: 0.02; transform: translateX(-1px); }
          95% { opacity: 0.06; transform: translateX(1px); }
        }
        @keyframes glitchTear {
          0%, 85%, 100% { clip-path: inset(0); }
          86% { clip-path: inset(20% 0 60% 0); transform: translateX(3px); }
          88% { clip-path: inset(50% 0 30% 0); transform: translateX(-2px); }
          90% { clip-path: inset(70% 0 10% 0); transform: translateX(1px); }
        }
        @keyframes corruptScan {
          from { top: -2px; }
          to { top: 100%; }
        }
        @keyframes portalFracture {
          0%, 100% { opacity: 0.06; }
          50% { opacity: 0.1; }
        }
        @keyframes portalPulse {
          0%, 100% { opacity: 0.8; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        @keyframes coreBreath {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }

        @media (prefers-reduced-motion: reduce) {
          .bw-bg__grid, .bw-bg__particles, .bw-bg__particles::before, .bw-bg__particles::after,
          .bw-bg__glow::before {
            animation: none !important;
          }
        }
      `}</style>
    </>
  )
}

export default BattleworldBg
