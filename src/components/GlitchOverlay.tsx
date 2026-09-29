export default function GlitchOverlay({ visible, phase = 0 }: { visible: boolean; phase?: number }) {
  if (!visible) return null
  return (
    <>
      <style>{`
        .glitch-container {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 999;
          overflow: hidden;
        }
        
        .glitch-base {
          position: absolute;
          inset: 0;
          background: rgba(199, 58, 50, ${Math.min(0.05 + phase * 0.05, 0.3)});
          pointer-events: none;
        }

        .glitch-scanlines {
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            0deg,
            transparent 0,
            transparent 2px,
            rgba(199, 58, 50, ${phase >= 3 ? 0.15 : 0.05}) 2px,
            rgba(199, 58, 50, ${phase >= 3 ? 0.15 : 0.05}) 4px
          );
          pointer-events: none;
        }
        
        ${phase >= 2 ? `
        .glitch-h-displace {
          position: absolute;
          inset: 0;
          background: rgba(199, 58, 50, 0.1);
          animation: glitchDisplace 0.2s infinite linear alternate-reverse;
          pointer-events: none;
        }
        
        .glitch-rgb {
          position: absolute;
          inset: 0;
          filter: drop-shadow(4px 0 0 rgba(255,0,0,0.4)) drop-shadow(-4px 0 0 rgba(0,255,255,0.4));
          animation: glitchDisplace 0.3s infinite linear alternate;
          pointer-events: none;
          background: rgba(255,255,255,0.02);
        }
        ` : ''}

        ${phase >= 3 ? `
        .glitch-v-tear {
          position: absolute;
          inset: 0;
          background: rgba(255,255,255,0.05);
          animation: glitchTear 0.15s infinite linear;
          pointer-events: none;
        }
        .glitch-flash {
          position: absolute;
          inset: 0;
          box-shadow: inset 0 0 ${phase * 20}px rgba(199, 58, 50, 0.8);
          animation: glitchFlash 0.1s infinite alternate;
        }
        ` : ''}

        ${phase >= 4 ? `
        .glitch-noise {
          position: absolute;
          inset: -200%;
          background-image: url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E');
          opacity: 0.15;
          animation: noiseJitter 0.2s infinite;
          pointer-events: none;
          mix-blend-mode: overlay;
        }
        ` : ''}

        @keyframes glitchDisplace {
          0%, 100% { clip-path: inset(0); transform: none; }
          10% { clip-path: inset(40% 0 30% 0); transform: translateX(4px); }
          20% { clip-path: inset(80% 0 5% 0); transform: translateX(-4px); }
          30% { clip-path: inset(10% 0 70% 0); transform: translateX(8px); }
          40% { clip-path: inset(60% 0 20% 0); transform: translateX(-8px); }
          50% { clip-path: inset(20% 0 50% 0); transform: translateX(6px); }
          60% { clip-path: inset(90% 0 5% 0); transform: translateX(-6px); }
          70% { clip-path: inset(30% 0 40% 0); transform: translateX(10px); }
          80% { clip-path: inset(70% 0 10% 0); transform: translateX(-10px); }
          90% { clip-path: inset(5% 0 85% 0); transform: translateX(5px); }
        }

        @keyframes glitchTear {
          0%, 100% { clip-path: inset(0); transform: none; }
          20% { clip-path: inset(0 40% 0 30%); transform: translateY(4px); }
          40% { clip-path: inset(0 80% 0 5%); transform: translateY(-4px); }
          60% { clip-path: inset(0 10% 0 70%); transform: translateY(8px); }
          80% { clip-path: inset(0 60% 0 20%); transform: translateY(-8px); }
        }

        @keyframes glitchFlash {
          0% { opacity: 0.5; }
          100% { opacity: 1; }
        }

        @keyframes noiseJitter {
          0% { transform: translate(0,0); }
          10% { transform: translate(-5%,-5%); }
          20% { transform: translate(-10%,5%); }
          30% { transform: translate(5%,-10%); }
          40% { transform: translate(-5%,15%); }
          50% { transform: translate(-10%,5%); }
          60% { transform: translate(15%,0); }
          70% { transform: translate(0,15%); }
          80% { transform: translate(3%,35%); }
          90% { transform: translate(-10%,10%); }
          100% { transform: translate(0,0); }
        }
        
        @media (prefers-reduced-motion: reduce) {
          .glitch-h-displace, .glitch-rgb, .glitch-v-tear, .glitch-flash, .glitch-noise {
            animation: none !important;
            transform: none !important;
            clip-path: none !important;
          }
        }
      `}</style>
      
      <div className="glitch-container" aria-hidden="true">
        <div className="glitch-base" />
        <div className="glitch-scanlines" />
        {phase >= 2 && <div className="glitch-h-displace" />}
        {phase >= 2 && <div className="glitch-rgb" />}
        {phase >= 3 && <div className="glitch-v-tear" />}
        {phase >= 3 && <div className="glitch-flash" />}
        {phase >= 4 && <div className="glitch-noise" />}
      </div>
    </>
  )
}
