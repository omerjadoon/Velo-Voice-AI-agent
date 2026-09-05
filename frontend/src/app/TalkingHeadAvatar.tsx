"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

interface TalkingHeadAvatarProps {
  state: string;
  amplitude?: number;
}

// ARKit morph target groups for facecap
const MOUTH_OPEN_TARGETS = ["jawOpen", "mouthOpen"];
const LIP_TARGETS = ["mouthFunnel", "mouthPucker"];
const SMILE_TARGETS = ["mouthSmile_L", "mouthSmile_R"];
const BLINK_L = ["eyeBlink_L"];
const BLINK_R = ["eyeBlink_R"];
const BROW_UP = ["browInnerUp", "browOuterUp_L", "browOuterUp_R"];
const BROW_DOWN = ["browDown_L", "browDown_R"];

// Viseme cycling phonemes for speech animation
const VISEME_SHAPES = [
  ["jawOpen", "mouthFunnel"],            // AA / AH open vowel
  ["mouthPucker", "jawOpen"],            // OO / UU rounded
  ["mouthSmile_L", "mouthSmile_R"],      // EE / IH smile
  ["jawOpen", "mouthOpen"],              // AE / EH open
  ["mouthPucker"],                       // OW / OH
  ["jawOpen", "mouthSmile_L"],           // AY blend
];

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
    const morphTargets: Record<string, number> = {};
    let faceMesh: THREE.Mesh | null = null;
    let modelGroup: THREE.Group | null = null;

    const W = mount.clientWidth || 480;
    const H = mount.clientHeight || 480;

    // ── 1. Three.js Scene, Camera & WebGL Renderer ───────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 100);
    camera.position.set(0, 0.04, 3.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    mount.appendChild(renderer.domElement);

    // ── 2. Studio Lighting Setup ─────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 1.8));

    const key = new THREE.DirectionalLight(0xfff0dd, 3.5);
    key.position.set(1.5, 2.5, 3);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x00f2fe, 2.0);
    fill.position.set(-2, 1, 2);
    scene.add(fill);

    const rim = new THREE.PointLight(0xa78bfa, 4.0, 8);
    rim.position.set(0, 2, -1.8);
    scene.add(rim);

    // ── 3. Outer Soundwave Audio Halo Rings ──────────────────────────────────
    const ringGeo = new THREE.TorusGeometry(1.2, 0.008, 16, 100);
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

    // ── 4. Load facecap 3D Model with ARKit Morph Targets ───────────────────
    async function loadModel() {
      try {
        setLoading(true);
        setError(null);

        await MeshoptDecoder.ready;

        const ktx2Loader = new KTX2Loader();
        ktx2Loader.setTranscoderPath("https://cdn.jsdelivr.net/npm/three@0.185.0/examples/jsm/libs/basis/");
        ktx2Loader.detectSupport(renderer);

        const loader = new GLTFLoader();
        loader.setKTX2Loader(ktx2Loader);
        loader.setMeshoptDecoder(MeshoptDecoder);

        loader.load(
          "/facecap.glb",
          (gltf) => {
            modelGroup = gltf.scene;

            // Auto-center & auto-scale model based on bounding box
            const box = new THREE.Box3().setFromObject(modelGroup);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());

            modelGroup.position.sub(center);
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) {
              modelGroup.scale.setScalar(1.15 / maxDim);
            }

            modelGroup.position.y += 0.05;

            // Extract morph targets and apply realistic skin material if needed
            modelGroup.traverse((child) => {
              const mesh = child as THREE.Mesh;
              if (mesh.isMesh) {
                if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
                  faceMesh = mesh;
                  Object.assign(morphTargets, mesh.morphTargetDictionary);
                }

                // If mesh has basic material or missing texture, give it realistic human skin tone
                if (!mesh.material || (mesh.material as any).isMeshBasicMaterial) {
                  mesh.material = new THREE.MeshStandardMaterial({
                    color: 0xd4a373,
                    roughness: 0.5,
                    metalness: 0.1,
                  });
                }
              }
            });

            scene.add(modelGroup);
            setLoading(false);
          },
          undefined,
          (err) => {
            console.error("facecap model load error:", err);
            setError("Initializing avatar presentation...");
            setLoading(false);
          }
        );
      } catch (e: any) {
        console.error("3D avatar init error:", e);
        setLoading(false);
      }
    }

    loadModel();

    // ── 5. Morph Target Setter Helper ────────────────────────────────────────
    function setMorph(names: string[], target: number, speed = 0.2) {
      if (!faceMesh?.morphTargetInfluences) return;
      for (const name of names) {
        const idx = morphTargets[name];
        if (idx !== undefined && idx < faceMesh.morphTargetInfluences.length) {
          const cur = faceMesh.morphTargetInfluences[idx] ?? 0;
          faceMesh.morphTargetInfluences[idx] = THREE.MathUtils.lerp(cur, target, speed);
        }
      }
    }

    // ── 6. Animation Loop: Lip Sync, Eyeblink & Idle Sway ───────────────────
    const t0 = performance.now();
    let visemeTimer = 0;
    let currentViseme = 0;

    function animate() {
      animId = requestAnimationFrame(animate);
      const t = (performance.now() - t0) * 0.001;
      const s = stateRef.current;
      const amp = ampRef.current;

      const speakAmp = s === "speaking"
        ? Math.max(amp, 0.45 + Math.sin(t * 14) * 0.35 + Math.sin(t * 7.5) * 0.2)
        : amp;

      if (faceMesh?.morphTargetInfluences) {
        // A. Lip Sync
        if (s === "speaking") {
          visemeTimer += 1 / 60;
          if (visemeTimer > 0.08 + Math.random() * 0.04) {
            visemeTimer = 0;
            currentViseme = (currentViseme + 1) % VISEME_SHAPES.length;
          }
          setMorph([...MOUTH_OPEN_TARGETS, ...LIP_TARGETS, ...SMILE_TARGETS], 0, 0.25);
          setMorph(VISEME_SHAPES[currentViseme], speakAmp, 0.35);
          setMorph(MOUTH_OPEN_TARGETS, speakAmp * 0.75, 0.3);
        } else {
          setMorph([...MOUTH_OPEN_TARGETS, ...LIP_TARGETS], 0, 0.12);
          setMorph(SMILE_TARGETS, 0.1, 0.05);
        }

        // B. Eye Blinking
        const blinkCycle = t % 3.6;
        const isBlinking = blinkCycle > 3.45;
        const blinkVal = isBlinking ? Math.sin((blinkCycle - 3.45) * Math.PI / 0.15) : 0;
        setMorph(BLINK_L, blinkVal, 0.5);
        setMorph(BLINK_R, blinkVal, 0.5);

        // C. Brow Expressions
        if (s === "thinking") {
          setMorph(BROW_DOWN, 0.4, 0.05);
          setMorph(BROW_UP, 0.3, 0.05);
        } else if (s === "listening") {
          setMorph(BROW_UP, 0.35, 0.05);
          setMorph(BROW_DOWN, 0, 0.05);
        } else {
          setMorph([...BROW_UP, ...BROW_DOWN], 0, 0.05);
        }
      }

      // Lighting Colors by State
      const targetRimColor =
        s === "listening" ? 0x00f5a0 :
        s === "thinking"  ? 0xfbbf24 :
        s === "speaking"  ? 0xec4899 :
                            0xa78bfa;
      rim.color.lerp(new THREE.Color(targetRimColor), 0.06);

      // Model Idle Movement
      if (modelGroup) {
        modelGroup.rotation.y = Math.sin(t * 0.7) * 0.08;
        modelGroup.rotation.x = Math.sin(t * 1.0) * 0.03;
        modelGroup.rotation.z = Math.cos(t * 0.6) * 0.02;
      }

      // Halo Rings Rotation & Pulse
      haloRing1.rotation.z = t * 0.3;
      haloRing2.rotation.z = -t * 0.25;
      haloRing1.scale.setScalar(1 + (s === "speaking" ? speakAmp * 0.12 : Math.sin(t * 2) * 0.03));
      haloRing2.scale.setScalar(1 + (s === "speaking" ? speakAmp * 0.16 : Math.cos(t * 2) * 0.03));

      renderer.render(scene, camera);
    }

    animate();

    // ── 7. Resize Observer ──────────────────────────────────────────────────
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
    <div className="relative w-full h-full flex items-center justify-center pointer-events-none">
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-black/50 backdrop-blur-md rounded-2xl p-6 text-center pointer-events-auto">
          <div className="w-10 h-10 border-4 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
          <p className="text-xs font-medium text-cyan-300 tracking-wider uppercase">Loading 3D Talking Head Avatar...</p>
        </div>
      )}

      {error && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-amber-500/20 border border-amber-500/40 rounded-full text-xs text-amber-300 backdrop-blur-md pointer-events-auto">
          {error}
        </div>
      )}

      <div
        ref={mountRef}
        className="w-full h-full max-w-[550px] max-h-[550px] flex items-center justify-center drop-shadow-[0_0_35px_rgba(0,242,254,0.35)]"
      />
    </div>
  );
}
