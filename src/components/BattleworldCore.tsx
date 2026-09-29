import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface BattleworldCoreProps {
  stoneCount: number;
}

export default function BattleworldCore({ stoneCount }: BattleworldCoreProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const frameIdRef = useRef<number>(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    try {
      const container = mountRef.current;
      if (!container) return;

      const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const isMobile = window.innerWidth < 768;

      // SCENE, CAMERA, RENDERER
      const scene = new THREE.Scene();
      
      const aspect = container.clientHeight > 0 ? container.clientWidth / container.clientHeight : 1;
      const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
      camera.position.z = 6;
      
      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setClearColor(0x000000, 0);

      container.appendChild(renderer.domElement);

      // MATERIALS
      const baseColor = 0x00ff7f; // Emerald
      const emissiveIntensity = Math.min(0.2 + (stoneCount * 0.15), 1.2);
      
      const coreMaterial = new THREE.MeshStandardMaterial({
        color: 0x052e16,
        emissive: baseColor,
        emissiveIntensity: emissiveIntensity,
        wireframe: false,
        roughness: 0.2,
        metalness: 0.8
      });

      const ringMaterial = new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: baseColor,
        emissiveIntensity: stoneCount > 0 ? (stoneCount * 0.1) : 0.05,
        wireframe: true,
        transparent: true,
        opacity: 0.6
      });

      const fragmentMaterial = new THREE.MeshStandardMaterial({
        color: 0x052e16,
        emissive: baseColor,
        emissiveIntensity: emissiveIntensity * 0.5,
        roughness: 0.4,
        metalness: 0.7
      });

      // GEOMETRIES
      const geometries: THREE.BufferGeometry[] = [];
      const meshesToDispose: THREE.Mesh[] = [];
      
      // 1. Central energy sphere
      const coreGeo = new THREE.IcosahedronGeometry(1, 2);
      geometries.push(coreGeo);
      const core = new THREE.Mesh(coreGeo, coreMaterial);
      scene.add(core);
      meshesToDispose.push(core);

      // 2. Rings
      const rings: { mesh: THREE.Mesh, speedX: number, speedY: number, activeLimit: number }[] = [];
      
      if (!isMobile || stoneCount >= 3) {
        const ringSpecs = [
          { radius: 1.6, tube: 0.02, speedX: 0.005, speedY: 0.01, activeLimit: 1 },
          { radius: 1.8, tube: 0.01, speedX: -0.008, speedY: -0.006, activeLimit: 3 },
          { radius: 2.1, tube: 0.03, speedX: 0.012, speedY: -0.015, activeLimit: 5 }
        ];

        ringSpecs.forEach((spec) => {
          const ringGeo = new THREE.TorusGeometry(spec.radius, spec.tube, 8, 50);
          geometries.push(ringGeo);
          const ring = new THREE.Mesh(ringGeo, ringMaterial);
          
          ring.rotation.x = Math.random() * Math.PI;
          ring.rotation.y = Math.random() * Math.PI;
          
          scene.add(ring);
          meshesToDispose.push(ring);
          rings.push({ mesh: ring, speedX: spec.speedX, speedY: spec.speedY, activeLimit: spec.activeLimit });
        });
      }

      // 3. Fragments
      const fragments: { mesh: THREE.Mesh, angle: number, dist: number, speed: number, rotSpeed: number }[] = [];
      const numFragments = isMobile ? 3 : 8;
      
      for (let i = 0; i < numFragments; i++) {
        const fragGeo = new THREE.OctahedronGeometry(Math.random() * 0.15 + 0.05);
        geometries.push(fragGeo);
        const frag = new THREE.Mesh(fragGeo, fragmentMaterial);
        
        const angle = (i / numFragments) * Math.PI * 2;
        const dist = 2.5 + Math.random() * 1.5;
        
        frag.position.set(Math.cos(angle) * dist, (Math.random() - 0.5) * 2, Math.sin(angle) * dist);
        scene.add(frag);
        meshesToDispose.push(frag);
        
        fragments.push({
          mesh: frag,
          angle: angle,
          dist: dist,
          speed: 0.002 + Math.random() * 0.005,
          rotSpeed: 0.01 + Math.random() * 0.02
        });
      }

      // 4. Lighting
      const ambientLight = new THREE.AmbientLight(0x0a1a0e, 1);
      scene.add(ambientLight);

      const pointLight = new THREE.PointLight(baseColor, emissiveIntensity * 5, 10);
      scene.add(pointLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
      dirLight.position.set(5, 5, 5);
      scene.add(dirLight);

      // Resize handler
      const handleResize = (entries: ResizeObserverEntry[]) => {
        if (entries.length === 0) return;
        const { width, height } = entries[0].contentRect;
        if (height > 0) {
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        }
        renderer.setSize(width, height);
      };

      resizeObserverRef.current = new ResizeObserver(handleResize);
      resizeObserverRef.current.observe(container);

      // ANIMATION
      let time = 0;
      
      const animate = () => {
        if (!isReducedMotion) {
          frameIdRef.current = requestAnimationFrame(animate);
        }
        
        time += 0.016;
        
        // Camera float
        camera.position.y = Math.sin(time) * 0.2;
        camera.lookAt(0, 0, 0);

        // Core rotation
        core.rotation.y += 0.005;
        core.rotation.x += 0.002;

        if (stoneCount >= 5) {
          const flicker = Math.random() > 0.8 ? 0.8 : 1.2;
          pointLight.intensity = emissiveIntensity * 5 * flicker;
          if (stoneCount >= 6) {
             pointLight.intensity += Math.sin(time * 10) * 2;
          }
        }

        let speedMultiplier = 1;
        if (stoneCount >= 5) speedMultiplier = 3;
        if (stoneCount >= 6) speedMultiplier = 5;

        rings.forEach(ringObj => {
          if (stoneCount >= ringObj.activeLimit) {
            ringObj.mesh.rotation.x += ringObj.speedX * speedMultiplier;
            ringObj.mesh.rotation.y += ringObj.speedY * speedMultiplier;
          }
        });

        fragments.forEach(fragObj => {
          fragObj.angle += fragObj.speed * (stoneCount > 0 ? stoneCount * 0.5 : 0.5);
          fragObj.mesh.position.x = Math.cos(fragObj.angle) * fragObj.dist;
          fragObj.mesh.position.z = Math.sin(fragObj.angle) * fragObj.dist;
          
          fragObj.mesh.position.y += Math.sin(time * 2 + fragObj.angle) * 0.01;
          
          fragObj.mesh.rotation.x += fragObj.rotSpeed;
          fragObj.mesh.rotation.y += fragObj.rotSpeed;
        });

        renderer.render(scene, camera);
      };

      animate();

      // CLEANUP
      return () => {
        cancelAnimationFrame(frameIdRef.current);
        if (resizeObserverRef.current) {
          resizeObserverRef.current.disconnect();
        }
        try {
          if (container && renderer.domElement && container.contains(renderer.domElement)) {
            container.removeChild(renderer.domElement);
          }
        } catch (e) {}
        
        meshesToDispose.forEach(mesh => {
          scene.remove(mesh);
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
          } else {
            mesh.material.dispose();
          }
        });
        
        try {
          renderer.forceContextLoss();
          renderer.dispose();
        } catch (e) {}
      };
    } catch (err) {
      console.error('Three.js Core Error:', err);
      return () => {};
    }
  }, [stoneCount]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
}
