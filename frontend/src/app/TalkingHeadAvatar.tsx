"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

// Module-level singletons to avoid duplicate loader warnings
let _ktx2Loader: KTX2Loader | null = null;

interface TalkingHeadAvatarProps {
  state: string;
  amplitude?: number;
}

// ARKit morph target groups
const MOUTH_OPEN_TARGETS = ["jawOpen"];
const LIP_TARGETS = ["mouthOpen", "mouthFunnel", "mouthPucker"];
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
    const morphTargets: Record<string, number> = {};  // name → index
    let faceMesh: THREE.Mesh | null = null;

    const W = mount.clientWidth || 480;
    const H = mount.clientHeight || 480;

    // ── Scene & Camera ─────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, W / H, 0.01, 100);
    camera.position.set(0, 0, 2.8);

    // ── Renderer ───────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    mount.appendChild(renderer.domElement);

    // ── Studio Lighting ────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 2.0));

    const key = new THREE.DirectionalLight(0xfff4e0, 4.0);
    key.position.set(1.5, 2, 3);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x88ccff, 2.5);
    fill.position.set(-2, 0.5, 2);
    scene.add(fill);

    const rim = new THREE.PointLight(0xa78bfa, 5, 8);
    rim.position.set(0, 2, -1.5);
    scene.add(rim);

    // ── Load facecap.glb (52 ARKit morph targets) — async init ───────────
    async function loadFacecap() {
      if (!_ktx2Loader) {
        _ktx2Loader = new KTX2Loader();
        _ktx2Loader.setTranscoderPath("/");
      }
      _ktx2Loader.detectSupport(renderer);

      // MeshoptDecoder must be ready before use
      await MeshoptDecoder.ready;

      const loader = new GLTFLoader();
      loader.setKTX2Loader(_ktx2Loader);
      loader.setMeshoptDecoder(MeshoptDecoder);

      loader.load(
        "/facecap.glb",
        (gltf) => {
          const model = gltf.scene;
          model.scale.setScalar(4.5);
          model.position.set(0, -0.22, 0);
          scene.add(model);

          // Find the mesh with morph targets
          model.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (mesh.isMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
              faceMesh = mesh;
              Object.assign(morphTargets, mesh.morphTargetDictionary);
            }
          });

          setLoading(false);
        },
        undefined,
        (err) => {
          console.error("facecap load error:", err);
          setError("Could not load face model.");
          setLoading(false);
        }
      );
    }

    loadFacecap();

    // ── Helpers ────────────────────────────────────────────────────────────
    // Smoothly set a named morph target
    function setMorph(names: string[], target: number, speed = 0.18) {
      if (!faceMesh?.morphTargetInfluences) return;
      for (const name of names) {
        const idx = morphTargets[name];
        if (idx === undefined) continue;
        const cur = faceMesh.morphTargetInfluences[idx] ?? 0;
        faceMesh.morphTargetInfluences[idx] = THREE.MathUtils.lerp(cur, target, speed);
      }
    }

    // ── Animation Loop ─────────────────────────────────────────────────────
    const t0 = performance.now();
    let visemeTimer = 0;
    let currentViseme = 0;

    function animate() {
      animId = requestAnimationFrame(animate);
      const t = (performance.now() - t0) * 0.001;
      const s = stateRef.current;
      const amp = ampRef.current;

      // Simulate amplitude when speaking but no raw amp signal yet
      const speakAmp = s === "speaking"
        ? Math.max(amp, 0.4 + Math.sin(t * 13) * 0.35 + Math.sin(t * 7.3) * 0.2)
        : amp;

      if (faceMesh?.morphTargetInfluences) {
        // ── 1. Lip-sync ────────────────────────────────────────────────────
        if (s === "speaking") {
          // Cycle through viseme shapes every ~80–120ms
          visemeTimer += 1 / 60;
          if (visemeTimer > 0.09 + Math.random() * 0.05) {
            visemeTimer = 0;
            currentViseme = (currentViseme + 1) % VISEME_SHAPES.length;
          }
          // Deactivate all lip targets first
          setMorph([...MOUTH_OPEN_TARGETS, ...LIP_TARGETS, ...SMILE_TARGETS], 0, 0.3);
          // Apply current viseme at amplitude-scaled weight
          setMorph(VISEME_SHAPES[currentViseme], speakAmp, 0.35);
          // Jaw open proportional to amplitude
          setMorph(MOUTH_OPEN_TARGETS, speakAmp * 0.7, 0.3);
        } else {
          // Close mouth when not speaking
          setMorph([...MOUTH_OPEN_TARGETS, ...LIP_TARGETS], 0, 0.12);
          // Subtle idle smile
          setMorph(SMILE_TARGETS, 0.1, 0.05);
        }

        // ── 2. Eye Blinking ─────────────────────────────────────────────────
        const blinkCycle = t % 3.8;
        const isBlinking = blinkCycle > 3.6;
        const blinkVal = isBlinking ? Math.sin((blinkCycle - 3.6) * Math.PI / 0.18) : 0;
        setMorph(BLINK_L, blinkVal, 0.45);
        setMorph(BLINK_R, blinkVal, 0.45);

        // ── 3. Brow Expressions ─────────────────────────────────────────────
        if (s === "thinking") {
          setMorph(BROW_DOWN, 0.5, 0.05);
          setMorph(BROW_UP, 0.3, 0.05);
        } else if (s === "listening") {
          setMorph(BROW_UP, 0.4, 0.05);
          setMorph(BROW_DOWN, 0, 0.05);
        } else {
          setMorph([...BROW_UP, ...BROW_DOWN], 0, 0.05);
        }

        // ── 4. Subtle Eye Look Around ───────────────────────────────────────
        if (s === "thinking") {
          const lookH = Math.sin(t * 1.2) * 0.25;
          const lookV = Math.sin(t * 0.9) * 0.2;
          setMorph(["eyeLookOut_L", "eyeLookIn_R"], Math.max(0, lookH), 0.04);
          setMorph(["eyeLookIn_L", "eyeLookOut_R"], Math.max(0, -lookH), 0.04);
          setMorph(["eyeLookUp_L", "eyeLookUp_R"], Math.max(0, lookV), 0.04);
          setMorph(["eyeLookDown_L", "eyeLookDown_R"], Math.max(0, -lookV), 0.04);
        } else {
          setMorph(["eyeLookOut_L", "eyeLookIn_R", "eyeLookIn_L", "eyeLookOut_R",
            "eyeLookUp_L", "eyeLookUp_R", "eyeLookDown_L", "eyeLookDown_R"], 0, 0.05);
        }
      }

      // ── 5. Lighting Color by State ────────────────────────────────────────
      const targetRimColor =
        s === "listening" ? 0x00f5a0 :
        s === "thinking"  ? 0xfbbf24 :
        s === "speaking"  ? 0xec4899 :
                            0xa78bfa;
      rim.color.lerp(new THREE.Color(targetRimColor), 0.06);
      fill.color.lerp(new THREE.Color(
        s === "speaking" ? 0x00f2fe :
        s === "listening" ? 0x00d9a0 : 0x88ccff
      ), 0.06);

      // ── 6. Idle Head Sway ─────────────────────────────────────────────────
      if (scene.children[3]) { // model group
        const model = scene.children.find(c => c.type === "Group");
        if (model) {
          model.rotation.y = Math.sin(t * 0.7) * 0.06;
          model.rotation.z = Math.sin(t * 0.5) * 0.015;
          model.rotation.x = Math.sin(t * 0.9) * 0.025;
        }
      }

      renderer.render(scene, camera);
    }

    animate();

    // ── Resize ─────────────────────────────────────────────────────────────
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
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="relative w-full h-full flex items-center justify-center min-h-[420px]">
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-black/50 backdrop-blur-md rounded-2xl">
          <div className="w-10 h-10 border-4 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
          <p className="text-xs font-medium text-cyan-300 tracking-wider uppercase">Loading Talking Head Avatar…</p>
        </div>
      )}
      {error && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-amber-500/20 border border-amber-500/40 rounded-full text-xs text-amber-300 backdrop-blur-md">
          {error}
        </div>
      )}
      <div ref={mountRef} className="w-full h-full max-w-[520px] max-h-[520px]" />
    </div>
  );
}
