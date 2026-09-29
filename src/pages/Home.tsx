import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { useGame } from '../contexts/GameContext';

export default function Home() {
  const mountRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { state } = useGame();
  const [countdown, setCountdown] = useState('T-00:00:00:00');
  const [isArmed, setIsArmed] = useState(false);
  const animRef = useRef<{ t: number; frameId: number | null }>({ t: 0, frameId: null });

  useEffect(() => {
    try {
      const container = mountRef.current;
      if (!container) return;

      // ---------- 3D Scene (EXACT match to user's original) ----------
      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x030a04, 0.02);

      const aspect = innerHeight > 0 ? innerWidth / innerHeight : 1;
      const camera = new THREE.PerspectiveCamera(70, aspect, 0.1, 1000);
      camera.position.set(0, 3, 14);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(innerWidth, innerHeight);
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      
      // Append the dynamically created canvas
      container.appendChild(renderer.domElement);

      // Toxic green ambient + key light, warm signal rim
      scene.add(new THREE.AmbientLight(0x0a2210, 1.2));
      const key = new THREE.PointLight(0x22d15a, 2.5, 80);
      key.position.set(0, 12, 0);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xd4a83a, 0.7);
      rim.position.set(-8, 5, 6);
      scene.add(rim);

      // Cracked ground
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200, 60, 60),
        new THREE.MeshStandardMaterial({ color: 0x050f08, roughness: 1, wireframe: false })
      );
      ground.rotation.x = -Math.PI / 2;
      scene.add(ground);

      // Distort terrain into wasteland
      const pos = ground.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setZ(i, Math.random() * Math.sin(pos.getX(i) * 0.15) * 1.6);
      }
      pos.needsUpdate = true;

      // Central doomsday monolith (obsidian)
      const monolith = new THREE.Mesh(
        new THREE.BoxGeometry(2.5, 12, 2.5),
        new THREE.MeshStandardMaterial({ color: 0x0a0d0a, roughness: 0.3, metalness: 0.9, emissive: 0x0d3018 })
      );
      monolith.position.y = 6;
      scene.add(monolith);

      // Floating debris ring — EXACT same as original
      const debris: THREE.Mesh[] = [];
      for (let i = 0; i < 90; i++) {
        const d = new THREE.Mesh(
          new THREE.TetrahedronGeometry(Math.random() * 0.5 + 0.1),
          new THREE.MeshStandardMaterial({ color: 0x081a0d, emissive: 0x2be066, emissiveIntensity: 0.6, roughness: 0.6 })
        );
        const a = Math.random() * Math.PI * 2;
        const r = 8 + Math.random() * 20;
        d.position.set(Math.cos(a) * r, Math.random() * 14 + 1, Math.sin(a) * r);
        d.userData = { spin: Math.random() * 0.04, float: Math.random() * 0.02, a, r };
        scene.add(d);
        debris.push(d);
      }

      // Doomsday clock — rotating ring around monolith
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(4, 0.12, 10, 80),
        new THREE.MeshStandardMaterial({ color: 0x2be066, emissive: 0x2be066, emissiveIntensity: 1.4 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 8;
      scene.add(ring);

      // Ash particles
      const ashGeo = new THREE.BufferGeometry();
      const ashCount = 1200;
      const arr = new Float32Array(ashCount * 3);
      for (let i = 0; i < ashCount * 3; i++) arr[i] = (Math.random() - 0.5) * 80;
      ashGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const ash = new THREE.Points(ashGeo, new THREE.PointsMaterial({ color: 0x6be698, size: 0.08, transparent: true, opacity: 0.7 }));
      scene.add(ash);

      // ---------- Animate — EXACT same as original ----------
      const ref = animRef.current;
      ref.t = 0;

      function animate() {
        ref.frameId = requestAnimationFrame(animate);
        ref.t += 0.01;
        const t = ref.t;

        // Orbiting camera for cinematic feel
        camera.position.x = Math.sin(t * 0.15) * 14;
        camera.position.z = Math.cos(t * 0.15) * 14;
        camera.lookAt(0, 6, 0);

        monolith.rotation.y = t * 0.3;
        ring.rotation.z = t * 0.8;
        key.intensity = 2.5 + Math.sin(t * 4) * 0.6; // pulsing glow

        debris.forEach(d => {
          d.rotation.x += d.userData.spin;
          d.rotation.y += d.userData.spin;
          d.position.y += Math.sin(t + d.userData.a) * d.userData.float;
        });

        const p = ash.geometry.attributes.position;
        for (let i = 1; i < p.array.length; i += 3) {
          (p.array as Float32Array)[i] -= 0.04;                   // falling ash
          if ((p.array as Float32Array)[i] < 0) (p.array as Float32Array)[i] = 30;
        }
        p.needsUpdate = true;

        renderer.render(scene, camera);
      }
      animate();

      const handleResize = () => {
        if (innerHeight > 0) {
          camera.aspect = innerWidth / innerHeight;
          camera.updateProjectionMatrix();
        }
        renderer.setSize(innerWidth, innerHeight);
      };
      addEventListener('resize', handleResize);

      return () => {
        if (ref.frameId !== null) cancelAnimationFrame(ref.frameId);
        ref.frameId = null;
        removeEventListener('resize', handleResize);
        try {
          if (container && renderer.domElement && container.contains(renderer.domElement)) {
            container.removeChild(renderer.domElement);
          }
          renderer.forceContextLoss();
          renderer.dispose();
        } catch (e) {
          console.error('WebGL Cleanup Error:', e);
        }
      };
    } catch (err) {
      console.error('Three.js Initialization Error:', err);
      return () => {};
    }
  }, []);

  useEffect(() => {
    const eventDate = new Date('2026-12-31T00:00:00').getTime();

    const tick = () => {
      const diff = Math.max(0, eventDate - Date.now());
      const d = Math.floor(diff / 864e5);
      const h = Math.floor(diff / 36e5) % 24;
      const m = Math.floor(diff / 6e4) % 60;
      const s = Math.floor(diff / 1e3) % 60;
      setCountdown(
        `T-${String(d).padStart(2, '0')}:${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      );
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleEnter = () => {
    setIsArmed(true);
    setTimeout(() => {
      // Authentication, team membership and progression are server-authoritative.
      if (!state.authenticated) navigate('/auth');
      else if (!state.team) navigate('/team');
      else navigate('/hub');
    }, 1200);
  };

  return (
    <div className="home-container">
      <style>{`
        .home-container { overflow: hidden; background: #040a06; font-family: 'Space Mono', monospace; color: #38d66b; position: absolute; inset: 0; z-index: 1000; }
        .home-container canvas { position: fixed; inset: 0; z-index: 0; }
        .canvas-mount { position: fixed; inset: 0; z-index: 0; }

        .hud {
          position: fixed; inset: 0; z-index: 2; padding: 28px 38px;
          display: flex; flex-direction: column; justify-content: space-between;
          pointer-events: none; animation: boot 1.2s ease both;
        }
        .hud-header, .hud-footer { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
        .brand { display: flex; align-items: center; gap: 12px; color: #fff; font: 700 .9rem 'Space Mono', monospace; letter-spacing: .16em; }
        .brand-mark { width: 11px; height: 11px; background: #38d66b; box-shadow: 0 0 14px #38d66b; transform: rotate(45deg); }
        .status { display: inline-flex; align-items: center; gap: 9px; color: #a3e8b4; font-size: .68rem; letter-spacing: .14em; text-transform: uppercase; }
        .status-dot { width: 7px; height: 7px; border-radius: 50%; background: #f0b93d; box-shadow: 0 0 12px #f0b93d; animation: pulse 1.8s ease-in-out infinite; }
        .hud-footer { color: rgba(255, 255, 255, .55); font-size: .62rem; letter-spacing: .14em; text-transform: uppercase; }
        .footer-line { width: min(210px, 24vw); height: 1px; background: linear-gradient(90deg, #38d66b, transparent); }

        .content {
          position: relative; z-index: 2; height: 100vh; padding: 80px 24px 72px;
          display: flex; flex-direction: column; justify-content: center; align-items: center;
          text-align: center; pointer-events: none; animation: reveal 1.4s .15s ease both;
        }
        .content * { pointer-events: auto; }
        .eyebrow { margin-bottom: 14px; color: #f0b93d; font-size: .68rem; letter-spacing: .34em; text-transform: uppercase; }

        .content h1 {
          font: 700 clamp(4.5rem, 14vw, 11rem)/.78 'Barlow Condensed', sans-serif;
          letter-spacing: .055em; padding-left: .055em; color: #0b1c0f;
          text-shadow: 0 0 10px #38d66b, 0 0 40px #14a83f, 0 0 90px #063d18;
          animation: flicker 3s infinite; margin: 0;
        }
        @keyframes flicker {
          0%, 92%, 94%, 97%, 100% { opacity: 1; }
          93%, 96% { opacity: .4; }
        }

        .subtitle { margin-top: 18px; color: #a3e8b4; font-size: clamp(.62rem, 1.2vw, .85rem); letter-spacing: .38em; }
        .divider { display: flex; align-items: center; gap: 12px; width: min(420px, 74vw); margin-top: 28px; color: rgba(255,255,255,.38); font-size: .58rem; letter-spacing: .12em; }
        .divider::before, .divider::after { content: ''; height: 1px; flex: 1; background: rgba(56, 214, 107, .28); }
        .timer {
          margin-top: 12px; color: #f0b93d; font: 700 clamp(1.65rem, 4vw, 2.9rem) 'Space Mono', monospace;
          text-shadow: 0 0 12px #e0a828; letter-spacing: .14em;
        }
        .timer-label { margin-top: 8px; color: rgba(255,255,255,.42); font-size: .58rem; letter-spacing: .22em; text-transform: uppercase; }
        .btn {
          margin-top: 34px; padding: 15px 28px; border: 1px solid #38d66b; color: #fff;
          background: rgba(56, 214, 107, .08); font: 700 .72rem 'Space Mono', monospace;
          letter-spacing: .22em; cursor: pointer; transition: .3s; text-transform: uppercase;
        }
        .btn::after { content: '↗'; display: inline-block; margin-left: 16px; color: #f0b93d; transition: transform .3s; }
        .btn:hover, .btn:focus-visible { background: #38d66b; color: #000; box-shadow: 0 0 30px rgba(56, 214, 107, .55); outline: none; }
        .btn:hover::after, .btn:focus-visible::after { transform: translate(3px, -3px); color: #000; }
        .btn.armed { background: #f0b93d; border-color: #f0b93d; color: #000; box-shadow: 0 0 30px rgba(240, 185, 61, .4); }
        .btn.armed::after { content: '✓'; color: #000; }
        .meta { position: absolute; top: 50%; display: flex; flex-direction: column; gap: 10px; color: rgba(255,255,255,.5); font-size: .58rem; letter-spacing: .12em; text-transform: uppercase; }
        .meta-left { left: 38px; transform: translateY(-50%); writing-mode: vertical-rl; }
        .meta-right { right: 38px; transform: translateY(-50%) rotate(180deg); writing-mode: vertical-rl; }
        .meta strong { color: #a3e8b4; font-weight: 400; }

        @keyframes boot { from { opacity: 0; } to { opacity: 1; } }
        @keyframes reveal { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 50% { opacity: .35; transform: scale(.75); } }

        @media (max-width: 700px) {
          .hud { padding: 20px; }
          .hud-footer { font-size: .52rem; }
          .footer-line { width: 24vw; }
          .meta { display: none; }
          .content { padding: 70px 18px 56px; }
          .content h1 { font-size: clamp(4rem, 21vw, 7rem); }
          .subtitle { letter-spacing: .2em; line-height: 1.7; max-width: 300px; }
          .timer { letter-spacing: .08em; }
        }

        .scanlines {
          position: fixed; inset: 0; z-index: 3; pointer-events: none;
          background: repeating-linear-gradient(0deg, rgba(0,0,0,.18) 0 2px, transparent 2px 4px);
        }
        .vignette {
          position: fixed; inset: 0; z-index: 3; pointer-events: none;
          background: radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,.85) 100%);
        }
      `}</style>

      <div ref={mountRef} className="canvas-mount"></div>
      <div className="scanlines"></div>
      <div className="vignette"></div>

      <div className="hud" aria-hidden="true">
        <div className="hud-header">
          <div className="brand"><span className="brand-mark"></span>VOID//OPS</div>
          <div className="status"><span className="status-dot"></span>Signal stable</div>
        </div>
        <div className="hud-footer">
          <span>Sector 07 / Earth orbit</span>
          <span className="footer-line"></span>
          <span>Protocol 01.26</span>
        </div>
      </div>

      <div className="content">
        <div className="meta meta-left"><strong>Live transmission</strong>&nbsp; / &nbsp;No. 001</div>
        <div className="meta meta-right">Threat level: <strong>critical</strong>&nbsp; / &nbsp;Atmosphere: unstable</div>
        <div className="eyebrow">Operation begins when the clock reaches zero</div>
        <h1>DOOMSDAY</h1>
        <div className="subtitle">CAPTURE THE FLAG // FINAL PROTOCOL</div>
        <div className="divider"><span>COUNTDOWN TO DEPLOYMENT</span></div>
        <div className="timer">{countdown}</div>
        <div className="timer-label">
          {isArmed ? 'Transmission acknowledged // stand by' : 'All systems are waiting for your signal'}
        </div>
        <button
          className={`btn ${isArmed ? 'armed' : ''}`}
          type="button"
          onClick={handleEnter}
        >
          {isArmed ? 'Signal received' : 'Enter the void'}
        </button>
      </div>
    </div>
  );
}
