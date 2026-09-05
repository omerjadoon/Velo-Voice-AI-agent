"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { createNoise4D } from "simplex-noise";

interface AudioSphereProps {
  /** Agent state string from useVoiceAssistant() */
  state: string;
  /** 0–1 amplitude from the audio track (optional – enhances speaking morph) */
  amplitude?: number;
}

// Colour palettes per state
const STATE_COLORS: Record<string, { inner: string; outer: string; particle: string }> = {
  idle: { inner: "#3b82f6", outer: "#8b5cf6", particle: "#60a5fa" },
  initializing: { inner: "#3b82f6", outer: "#8b5cf6", particle: "#60a5fa" },
  connecting: { inner: "#3b82f6", outer: "#8b5cf6", particle: "#60a5fa" },
  listening: { inner: "#10b981", outer: "#06b6d4", particle: "#34d399" },
  thinking: { inner: "#f59e0b", outer: "#d946ef", particle: "#fbbf24" }, // Electric Amber to Vibrant Magenta
  speaking: { inner: "#8b5cf6", outer: "#ec4899", particle: "#f472b6" },
  failed: { inner: "#6b7280", outer: "#374151", particle: "#9ca3af" },
  disconnected: { inner: "#6b7280", outer: "#374151", particle: "#9ca3af" },
  "pre-connect-buffering": { inner: "#3b82f6", outer: "#8b5cf6", particle: "#60a5fa" },
};

// Speed and morph intensity per state
const STATE_DYNAMICS: Record<string, { speed: number; morph: number; pulse: number; particleSpeed: number }> = {
  idle: { speed: 0.25, morph: 0.15, pulse: 0.05, particleSpeed: 0.03 },
  initializing: { speed: 0.25, morph: 0.15, pulse: 0.05, particleSpeed: 0.03 },
  connecting: { speed: 0.3, morph: 0.2, pulse: 0.08, particleSpeed: 0.05 },
  listening: { speed: 0.55, morph: 0.32, pulse: 0.14, particleSpeed: 0.08 },
  thinking: { speed: 1.6, morph: 0.55, pulse: 0.38, particleSpeed: 0.25 }, // Energetic cognitive wave
  speaking: { speed: 1.4, morph: 0.65, pulse: 0.45, particleSpeed: 0.12 },
  failed: { speed: 0.1, morph: 0.05, pulse: 0.0, particleSpeed: 0.01 },
  disconnected: { speed: 0.1, morph: 0.05, pulse: 0.0, particleSpeed: 0.01 },
  "pre-connect-buffering": { speed: 0.25, morph: 0.15, pulse: 0.05, particleSpeed: 0.03 },
};

export default function AudioSphere({ state, amplitude = 0 }: AudioSphereProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  // Mutable refs so the animation loop always sees the latest values
  const stateRef = useRef(state);
  const ampRef = useRef(amplitude);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { ampRef.current = amplitude; }, [amplitude]);

  useEffect(() => {
    const mount = mountRef.current!;
    const W = mount.clientWidth || 300;
    const H = mount.clientHeight || 300;

    // ── Renderer ────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    // ── Scene & camera ───────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.z = 6;

    // ── Noise ────────────────────────────────────────────────────────────────
    const noise4D = createNoise4D();

    // ── Sphere geometry (store base positions) ───────────────────────────────
    const RADIUS = 1.15;
    const SEGMENTS = 64;
    const geo = new THREE.SphereGeometry(RADIUS, SEGMENTS, SEGMENTS);

    // Cache original positions
    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const count = posAttr.count;
    const basePos = new Float32Array(posAttr.array);

    // ── Wireframe sphere (the hero mesh) ─────────────────────────────────────
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x8888ff,
      wireframe: true,
      transparent: true,
      opacity: 0.38,
    });
    const wireMesh = new THREE.Mesh(geo, wireMat);
    scene.add(wireMesh);

    // ── Solid inner glow sphere (smaller, no wireframe) ──────────────────────
    const innerGeo = new THREE.SphereGeometry(RADIUS * 0.85, 32, 32);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x9900ff,
      transparent: true,
      opacity: 0.12,
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    scene.add(innerMesh);

    // ── Particle halo (Full-screen particle field) ───────────────────────────
    const PARTICLE_COUNT = 650;
    const pPositions = new Float32Array(PARTICLE_COUNT * 3);
    const pBaseRadii = new Float32Array(PARTICLE_COUNT);
    const pAngles = new Float32Array(PARTICLE_COUNT * 2); // theta, phi
    const pSizes = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const theta = Math.acos(2 * Math.random() - 1);
      const phi = 2 * Math.PI * Math.random();
      const r = RADIUS * (1.15 + Math.random() * 1.5);

      pAngles[i * 2] = theta;
      pAngles[i * 2 + 1] = phi;
      pBaseRadii[i] = r;

      pPositions[i * 3] = r * Math.sin(theta) * Math.cos(phi);
      pPositions[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi);
      pPositions[i * 3 + 2] = r * Math.cos(theta);
      pSizes[i] = 1.5 + Math.random() * 4.0;
    }

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPositions, 3));
    pGeo.setAttribute("size", new THREE.BufferAttribute(pSizes, 1));

    const pMat = new THREE.PointsMaterial({
      color: 0x9966ff,
      size: 0.028,
      transparent: true,
      opacity: 0.75,
      sizeAttenuation: true,
    });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    // ── Helpers: lerp colour ─────────────────────────────────────────────────
    const targetWireColor = new THREE.Color();
    const targetInnerColor = new THREE.Color();
    const targetParticleColor = new THREE.Color();
    const currentWireColor = new THREE.Color(0x8888ff);
    const currentInnerColor = new THREE.Color(0x9900ff);
    const currentPColor = new THREE.Color(0x9966ff);

    // ── Animation loop ───────────────────────────────────────────────────────
    const startTime = performance.now();
    let animId: number;

    function animate() {
      animId = requestAnimationFrame(animate);
      const t = (performance.now() - startTime) * 0.001;
      const s = stateRef.current as string;
      const amp = ampRef.current;

      const pal = STATE_COLORS[s] ?? STATE_COLORS.idle;
      const dyn = STATE_DYNAMICS[s] ?? STATE_DYNAMICS.idle;

      // Lerp colours toward target state palette
      targetWireColor.set(pal.inner);
      targetInnerColor.set(pal.outer);
      targetParticleColor.set(pal.particle);
      currentWireColor.lerp(targetWireColor, 0.05);
      currentInnerColor.lerp(targetInnerColor, 0.05);
      currentPColor.lerp(targetParticleColor, 0.05);

      wireMat.color.copy(currentWireColor);
      innerMat.color.copy(currentInnerColor);
      pMat.color.copy(currentPColor);

      // Morph sphere vertices via 4D simplex noise
      const morphScale = dyn.morph + amp * 0.6;
      const timeScale = dyn.speed;

      for (let i = 0; i < count; i++) {
        const x0 = basePos[i * 3];
        const y0 = basePos[i * 3 + 1];
        const z0 = basePos[i * 3 + 2];

        const len = Math.sqrt(x0 * x0 + y0 * y0 + z0 * z0) || 1;
        const nx = x0 / len;
        const ny = y0 / len;
        const nz = z0 / len;

        // Sample 4D noise
        const n = noise4D(
          nx * 1.8 + t * timeScale * 0.5,
          ny * 1.8 + t * timeScale * 0.4,
          nz * 1.8 + t * timeScale * 0.45,
          t * timeScale * 0.3,
        );

        // Pulse offset (breathing rhythm or fast cognitive ripple during thinking)
        const pulseFreq = s === "thinking" ? 6.0 : 2.5;
        const pulse = dyn.pulse * Math.sin(t * timeScale * pulseFreq + i * 0.002);

        const r = RADIUS + morphScale * n + pulse;
        posAttr.setXYZ(i, nx * r, ny * r, nz * r);
      }
      posAttr.needsUpdate = true;
      geo.computeVertexNormals();

      // Dynamic Particle Movement (accelerates and swirls during thinking)
      const pPosAttr = pGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const theta = pAngles[i * 2];
        const phi = pAngles[i * 2 + 1] + t * dyn.particleSpeed;
        const baseR = pBaseRadii[i];

        // Extra orbit expansion during thinking
        const orbitPulse = s === "thinking" ? Math.sin(t * 4 + i) * 0.15 : 0;
        const r = baseR + orbitPulse;

        pPosAttr.setXYZ(
          i,
          r * Math.sin(theta) * Math.cos(phi),
          r * Math.sin(theta) * Math.sin(phi),
          r * Math.cos(theta)
        );
      }
      pPosAttr.needsUpdate = true;

      // Orbit rotations
      wireMesh.rotation.y = t * 0.1 * timeScale;
      wireMesh.rotation.x = t * 0.04 * timeScale;
      innerMesh.rotation.y = -t * 0.07 * timeScale;
      particles.rotation.y = t * dyn.particleSpeed;

      // Wireframe opacity pulses
      const opacityFreq = s === "thinking" ? 4.0 : 1.8;
      wireMat.opacity = 0.3 + 0.25 * Math.abs(Math.sin(t * dyn.speed * opacityFreq));

      // Inner glow intensity
      innerMat.opacity = 0.08 + dyn.pulse * 0.25 * (0.5 + 0.5 * Math.sin(t * 3.0));

      renderer.render(scene, camera);
    }

    animate();

    // ── Resize observer ──────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      renderer.dispose();
      geo.dispose();
      innerGeo.dispose();
      pGeo.dispose();
      wireMat.dispose();
      innerMat.dispose();
      pMat.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
