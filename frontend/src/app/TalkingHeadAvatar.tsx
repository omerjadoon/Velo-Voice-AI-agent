"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

interface TalkingHeadAvatarProps {
  /** LiveKit voice assistant state */
  state: string;
  /** Live audio amplitude / track volume */
  amplitude?: number;
}

export default function TalkingHeadAvatar({ state, amplitude = 0 }: TalkingHeadAvatarProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

  const stateRef = useRef(state);
  const ampRef = useRef(amplitude);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { ampRef.current = amplitude; }, [amplitude]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let animId: number;

    const width = mount.clientWidth || 450;
    const height = mount.clientHeight || 450;

    // ── 1. Three.js Scene, Camera & WebGL Renderer ───────────────────────────
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0, 4.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);

    mount.appendChild(renderer.domElement);

    // ── 2. Studio Lighting Setup ─────────────────────────────────────────────
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0x00f2fe, 3);
    keyLight.position.set(2, 3, 3);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x8b5cf6, 2);
    fillLight.position.set(-2, 1, 2);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(0x00f5a0, 4, 6);
    rimLight.position.set(0, 2, -2);
    scene.add(rimLight);

    // ── 3. Construct 3D Cybernetic Talking Head Mesh ─────────────────────────
    const headGroup = new THREE.Group();
    scene.add(headGroup);

    // A. Main Head Cranium
    const headGeo = new THREE.SphereGeometry(1.0, 48, 48);
    headGeo.scale(0.82, 1.15, 0.92); // Proportionate human head shape
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x0c0f1d,
      roughness: 0.25,
      metalness: 0.8,
      wireframe: false,
    });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headGroup.add(headMesh);

    // B. Wireframe Topographic Circuit Overlay
    const wireGeo = headGeo.clone();
    wireGeo.scale(1.01, 1.01, 1.01);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x00f2fe,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    headGroup.add(wireMesh);

    // C. Glowing Cyber Eyes
    const eyeGeo = new THREE.SphereGeometry(0.12, 24, 24);
    eyeGeo.scale(1.2, 0.6, 0.6);
    const eyeMat = new THREE.MeshBasicMaterial({
      color: 0x00f2fe,
      transparent: true,
      opacity: 0.9,
    });

    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.28, 0.2, 0.76);
    headGroup.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.28, 0.2, 0.76);
    headGroup.add(rightEye);

    // D. Animated Lip-Sync Mouth Mesh
    const upperLipGeo = new THREE.BoxGeometry(0.36, 0.04, 0.08);
    const lowerLipGeo = new THREE.BoxGeometry(0.36, 0.04, 0.08);
    const lipMat = new THREE.MeshStandardMaterial({
      color: 0x00f2fe,
      emissive: 0x00f2fe,
      emissiveIntensity: 0.8,
      roughness: 0.2,
    });

    const upperLip = new THREE.Mesh(upperLipGeo, lipMat);
    upperLip.position.set(0, -0.28, 0.82);
    headGroup.add(upperLip);

    const lowerLip = new THREE.Mesh(lowerLipGeo, lipMat);
    lowerLip.position.set(0, -0.34, 0.82);
    headGroup.add(lowerLip);

    // Inner Mouth Glow Gap
    const mouthInnerGeo = new THREE.PlaneGeometry(0.32, 0.02);
    const mouthInnerMat = new THREE.MeshBasicMaterial({
      color: 0x8b5cf6,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    const mouthInner = new THREE.Mesh(mouthInnerGeo, mouthInnerMat);
    mouthInner.position.set(0, -0.31, 0.81);
    headGroup.add(mouthInner);

    // E. Outer Soundwave Audio Halo Rings
    const ringGeo = new THREE.TorusGeometry(1.35, 0.012, 16, 100);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00f2fe,
      transparent: true,
      opacity: 0.4,
    });
    const ring1 = new THREE.Mesh(ringGeo, ringMat);
    ring1.rotation.x = Math.PI / 2;
    headGroup.add(ring1);

    const ring2 = new THREE.Mesh(ringGeo, ringMat.clone());
    ring2.rotation.y = Math.PI / 4;
    headGroup.add(ring2);

    setLoading(false);

    // ── 4. Animation Loop ───────────────────────────────────────────────────
    const startTime = performance.now();

    function animate() {
      animId = requestAnimationFrame(animate);

      const t = (performance.now() - startTime) * 0.001;
      const s = stateRef.current;
      const rawAmp = ampRef.current;

      const speakingAmp = s === "speaking"
        ? Math.max(rawAmp, (Math.sin(t * 14) * 0.45 + 0.55) * (0.4 + Math.sin(t * 6) * 0.35))
        : rawAmp;

      // Color Theme Updates
      if (s === "listening") {
        wireMat.color.setHex(0x00f5a0);
        eyeMat.color.setHex(0x00f5a0);
        lipMat.color.setHex(0x00f5a0);
        lipMat.emissive.setHex(0x00f5a0);
      } else if (s === "thinking") {
        wireMat.color.setHex(0xfbbf24);
        eyeMat.color.setHex(0xfbbf24);
        lipMat.color.setHex(0xfbbf24);
        lipMat.emissive.setHex(0xfbbf24);
      } else if (s === "speaking") {
        wireMat.color.setHex(0x00f2fe);
        eyeMat.color.setHex(0x00f2fe);
        lipMat.color.setHex(0x8b5cf6);
        lipMat.emissive.setHex(0x8b5cf6);
      } else {
        wireMat.color.setHex(0x3b82f6);
        eyeMat.color.setHex(0x3b82f6);
        lipMat.color.setHex(0x3b82f6);
        lipMat.emissive.setHex(0x3b82f6);
      }

      // Head Breathing & Swaying Motion
      headGroup.rotation.y = Math.sin(t * 0.8) * 0.08;
      headGroup.rotation.x = Math.sin(t * 1.2) * 0.04;
      headGroup.rotation.z = Math.cos(t * 0.7) * 0.02;

      // Eyeblink Animation
      const blinkCycle = t % 3.8;
      const isBlinking = blinkCycle > 3.65;
      eyeMat.opacity = isBlinking ? 0.1 : (s === "thinking" ? 0.4 + Math.sin(t * 10) * 0.4 : 0.9);

      // Real-Time Lip-Sync & Mouth Opening
      const mouthGap = s === "speaking" ? 0.02 + speakingAmp * 0.14 : 0.005;
      upperLip.position.y = -0.28 + mouthGap * 0.5;
      lowerLip.position.y = -0.34 - mouthGap * 0.5;
      mouthInner.scale.y = 1 + mouthGap * 40;

      // Halo soundwave rings rotation & pulse
      ring1.rotation.z = t * 0.4;
      ring2.rotation.z = -t * 0.3;
      ring1.scale.setScalar(1 + (s === "speaking" ? speakingAmp * 0.15 : Math.sin(t * 2) * 0.04));
      ring2.scale.setScalar(1 + (s === "speaking" ? speakingAmp * 0.2 : Math.cos(t * 2) * 0.04));

      renderer.render(scene, camera);
    }

    animate();

    const handleResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      headGeo.dispose();
      wireGeo.dispose();
      eyeGeo.dispose();
      upperLipGeo.dispose();
      lowerLipGeo.dispose();
      mouthInnerGeo.dispose();
      ringGeo.dispose();
      headMat.dispose();
      wireMat.dispose();
      eyeMat.dispose();
      lipMat.dispose();
      mouthInnerMat.dispose();
      ringMat.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full flex items-center justify-center min-h-[420px]">
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-black/50 backdrop-blur-md rounded-2xl p-6 text-center">
          <div className="w-10 h-10 border-4 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
          <p className="text-xs font-medium text-cyan-300 tracking-wider uppercase">Loading 3D Talking Head Avatar...</p>
        </div>
      )}

      <div
        ref={mountRef}
        className="w-full h-full max-w-[500px] max-h-[500px] flex items-center justify-center drop-shadow-[0_0_35px_rgba(0,242,254,0.35)]"
      />
    </div>
  );
}
