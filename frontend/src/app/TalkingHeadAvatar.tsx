"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

interface TalkingHeadAvatarProps {
  /** LiveKit voice assistant state */
  state: string;
  /** Live audio amplitude / track volume */
  amplitude?: number;
}

export default function TalkingHeadAvatar({ state, amplitude = 0 }: TalkingHeadAvatarProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const stateRef = useRef(state);
  const ampRef = useRef(amplitude);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { ampRef.current = amplitude; }, [amplitude]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let animId: number;
    let renderer: THREE.WebGLRenderer;
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;

    let headMesh: THREE.Mesh | null = null;
    let headGroup: THREE.Group = new THREE.Group();
    let lowerJawMesh: THREE.Mesh | null = null;

    const width = mount.clientWidth || 480;
    const height = mount.clientHeight || 480;

    // ── 1. Setup Three.js Scene, Camera & WebGL Renderer ─────────────────────
    scene = new THREE.Scene();
    scene.add(headGroup);

    camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    camera.position.set(0, 0.1, 3.2);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    mount.appendChild(renderer.domElement);

    // ── 2. Cinematic Studio Lighting Setup ──────────────────────────────────
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    // Warm Key Light
    const keyLight = new THREE.DirectionalLight(0xfff0dd, 3.2);
    keyLight.position.set(2, 3, 3);
    scene.add(keyLight);

    // Cool Fill Light (Cyan / Blue Accent)
    const fillLight = new THREE.DirectionalLight(0x00d9f5, 1.8);
    fillLight.position.set(-2, 1, 2);
    scene.add(fillLight);

    // Purple Rim Light (Backlight separation)
    const rimLight = new THREE.PointLight(0xa78bfa, 3.5, 6);
    rimLight.position.set(0, 2, -2);
    scene.add(rimLight);

    // ── 3. Load Local Photorealistic 3D Male Head Model & Skin Texture ───────
    const textureLoader = new THREE.TextureLoader();
    const skinTexture = textureLoader.load("/skin_diffuse.jpg");
    skinTexture.colorSpace = THREE.SRGBColorSpace;

    const gltfLoader = new GLTFLoader();
    setLoading(true);

    gltfLoader.load(
      "/avatar.glb",
      (gltf) => {
        const model = gltf.scene;

        // Center & scale model
        model.scale.setScalar(0.28);
        model.position.set(0, -0.65, 0);

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            headMesh = mesh;

            // Apply realistic material with skin diffuse map
            mesh.material = new THREE.MeshStandardMaterial({
              map: skinTexture,
              roughness: 0.55,
              metalness: 0.1,
            });
          }
        });

        headGroup.add(model);
        setLoading(false);
      },
      undefined,
      (err) => {
        console.error("Error loading local 3D avatar:", err);
        setError("Failed to load 3D head model.");
        setLoading(false);
      }
    );

    // ── 4. Outer Soundwave Audio Halo Rings ──────────────────────────────────
    const ringGeo = new THREE.TorusGeometry(1.25, 0.01, 16, 100);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00f2fe,
      transparent: true,
      opacity: 0.35,
    });

    const haloRing1 = new THREE.Mesh(ringGeo, ringMat);
    haloRing1.rotation.x = Math.PI / 2.2;
    scene.add(haloRing1);

    const haloRing2 = new THREE.Mesh(ringGeo, ringMat.clone());
    haloRing2.rotation.y = Math.PI / 4;
    scene.add(haloRing2);

    // ── 5. Animation Loop: Natural Motion & Lip Sync ──────────────────────────
    const startTime = performance.now();

    function animate() {
      animId = requestAnimationFrame(animate);

      const t = (performance.now() - startTime) * 0.001;
      const s = stateRef.current;
      const rawAmp = ampRef.current;

      const speakingAmp = s === "speaking"
        ? Math.max(rawAmp, (Math.sin(t * 14) * 0.45 + 0.55) * (0.35 + Math.sin(t * 5.5) * 0.35))
        : rawAmp;

      // Color Theme Accents for Lighting
      if (s === "listening") {
        fillLight.color.setHex(0x00f5a0);
        rimLight.color.setHex(0x00f5a0);
        ringMat.color.setHex(0x00f5a0);
      } else if (s === "thinking") {
        fillLight.color.setHex(0xfbbf24);
        rimLight.color.setHex(0xfbbf24);
        ringMat.color.setHex(0xfbbf24);
      } else if (s === "speaking") {
        fillLight.color.setHex(0x00f2fe);
        rimLight.color.setHex(0xec4899);
        ringMat.color.setHex(0x00f2fe);
      } else {
        fillLight.color.setHex(0x3b82f6);
        rimLight.color.setHex(0xa78bfa);
        ringMat.color.setHex(0x3b82f6);
      }

      // Natural Head Swaying & Idle Breathing
      headGroup.rotation.y = Math.sin(t * 0.8) * 0.09;
      headGroup.rotation.x = Math.sin(t * 1.1) * 0.04;
      headGroup.rotation.z = Math.cos(t * 0.6) * 0.02;

      // Jaw / Pitch Lip-Sync Speech Modulation
      const mouthGap = s === "speaking" ? speakingAmp * 0.06 : 0;
      headGroup.position.y = -mouthGap * 0.5;

      // Ring Rotations & Pulse
      haloRing1.rotation.z = t * 0.3;
      haloRing2.rotation.z = -t * 0.25;
      haloRing1.scale.setScalar(1 + (s === "speaking" ? speakingAmp * 0.12 : Math.sin(t * 2) * 0.03));
      haloRing2.scale.setScalar(1 + (s === "speaking" ? speakingAmp * 0.16 : Math.cos(t * 2) * 0.03));

      renderer.render(scene, camera);
    }

    animate();

    // ── 6. Resize Observer ──────────────────────────────────────────────────
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
      ringGeo.dispose();
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
          <p className="text-xs font-medium text-cyan-300 tracking-wider uppercase">Loading Photorealistic 3D Man Avatar...</p>
        </div>
      )}

      {error && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-amber-500/20 border border-amber-500/40 rounded-full text-xs text-amber-300 backdrop-blur-md">
          {error}
        </div>
      )}

      <div
        ref={mountRef}
        className="w-full h-full max-w-[500px] max-h-[500px] flex items-center justify-center drop-shadow-[0_0_35px_rgba(0,242,254,0.35)]"
      />
    </div>
  );
}
