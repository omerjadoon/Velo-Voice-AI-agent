"use client";

/*
 * NOTE: TalkingHeadAvatar is currently commented out / disabled per user request.
 * The interface is now configured with Dual Chat Area & Voice Area (with 3D Audio Mesh always visible).
 */

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

export type AvatarModelMode = "photorealistic" | "expressive";

interface TalkingHeadAvatarProps {
  state: string;
  amplitude?: number;
  defaultMode?: AvatarModelMode;
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

/**
 * Creates a procedural 512x512 bump map canvas texture for human skin micro-pores.
 */
function createSkinPoreBumpMap(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.fillStyle = "rgb(128, 128, 128)";
  ctx.fillRect(0, 0, 512, 512);

  const imgData = ctx.getImageData(0, 0, 512, 512);
  const data = imgData.data;

  for (let i = 0; i < data.length; i += 4) {
    const x = (i / 4) % 512;
    const y = Math.floor((i / 4) / 512);

    const pore1 = (Math.sin(x * 0.4) * Math.cos(y * 0.4) + 1) * 0.5;
    const pore2 = Math.random();

    let val = 128;
    if (pore2 > 0.93) {
      val = Math.max(60, 128 - Math.floor(pore2 * 55));
    } else {
      const noise = (Math.random() - 0.5) * 14;
      val = Math.min(255, Math.max(0, 128 + noise + (pore1 - 0.5) * 8));
    }

    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
  }

  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 8);
  return texture;
}

/**
 * Creates a procedural 512x512 canvas texture for realistic eye sclera, iris & pupil.
 */
function createRealisticEyeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const cx = 256;
  const cy = 256;

  // 1. Off-white glossy sclera with soft radial shading
  const scleraGrad = ctx.createRadialGradient(cx, cy, 100, cx, cy, 256);
  scleraGrad.addColorStop(0, "#f8f9fa");
  scleraGrad.addColorStop(0.7, "#f1f3f5");
  scleraGrad.addColorStop(1, "#e2e8f0");
  ctx.fillStyle = scleraGrad;
  ctx.fillRect(0, 0, 512, 512);

  // Sclera blood vessels / veins for realism
  ctx.strokeStyle = "rgba(220, 90, 90, 0.15)";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2 + Math.random() * 0.2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * 120, cy + Math.sin(angle) * 120);
    ctx.quadraticCurveTo(
      cx + Math.cos(angle + 0.1) * 180,
      cy + Math.sin(angle + 0.1) * 180,
      cx + Math.cos(angle) * 240,
      cy + Math.sin(angle) * 240
    );
    ctx.stroke();
  }

  // 2. Limbal ring (dark outer iris border)
  ctx.beginPath();
  ctx.arc(cx, cy, 110, 0, Math.PI * 2);
  ctx.fillStyle = "#0f172a";
  ctx.fill();

  // 3. Iris gradient & striations (hazel / blue-cyan iris blend)
  const irisGrad = ctx.createRadialGradient(cx, cy, 35, cx, cy, 108);
  irisGrad.addColorStop(0, "#d97706");   // Warm golden inner ring
  irisGrad.addColorStop(0.45, "#0284c7"); // Vibrant blue-cyan iris
  irisGrad.addColorStop(0.85, "#0369a1"); // Deep ocean outer ring
  ctx.beginPath();
  ctx.arc(cx, cy, 108, 0, Math.PI * 2);
  ctx.fillStyle = irisGrad;
  ctx.fill();

  // Fine iris radial fibers
  ctx.lineWidth = 0.8;
  for (let a = 0; a < 100; a++) {
    const rad = (a / 100) * Math.PI * 2;
    const r1 = 36 + Math.random() * 4;
    const r2 = 104 - Math.random() * 6;
    ctx.strokeStyle = a % 2 === 0 ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rad) * r1, cy + Math.sin(rad) * r1);
    ctx.lineTo(cx + Math.cos(rad) * r2, cy + Math.sin(rad) * r2);
    ctx.stroke();
  }

  // 4. Dark central Pupil
  ctx.beginPath();
  ctx.arc(cx, cy, 38, 0, Math.PI * 2);
  ctx.fillStyle = "#050505";
  ctx.fill();

  // 5. Specular catchlight reflection
  ctx.beginPath();
  ctx.arc(cx - 24, cy - 24, 12, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Creates a 1024x1024 procedural facial skin texture with natural skin tones, soft eyebrows, and lip tinting.
 */
function createFaceCapSkinTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // 1. Natural warm skin tone background
  const skinGrad = ctx.createLinearGradient(0, 0, 0, 1024);
  skinGrad.addColorStop(0, "#f2c8b0");
  skinGrad.addColorStop(0.5, "#e5b399");
  skinGrad.addColorStop(1, "#d69f84");
  ctx.fillStyle = skinGrad;
  ctx.fillRect(0, 0, 1024, 1024);

  // 2. Soft cheek & nose warmth
  const cheekGradL = ctx.createRadialGradient(320, 520, 20, 320, 520, 180);
  cheekGradL.addColorStop(0, "rgba(225, 115, 105, 0.25)");
  cheekGradL.addColorStop(1, "rgba(225, 115, 105, 0)");
  ctx.fillStyle = cheekGradL;
  ctx.fillRect(0, 0, 1024, 1024);

  const cheekGradR = ctx.createRadialGradient(704, 520, 20, 704, 520, 180);
  cheekGradR.addColorStop(0, "rgba(225, 115, 105, 0.25)");
  cheekGradR.addColorStop(1, "rgba(225, 115, 105, 0)");
  ctx.fillStyle = cheekGradR;
  ctx.fillRect(0, 0, 1024, 1024);

  // 3. Eyebrows
  ctx.strokeStyle = "rgba(40, 25, 20, 0.55)";
  ctx.lineWidth = 14;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(260, 370);
  ctx.quadraticCurveTo(340, 340, 420, 375);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(604, 375);
  ctx.quadraticCurveTo(684, 340, 764, 370);
  ctx.stroke();

  // Eyebrow hair strokes
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(25, 15, 10, 0.7)";
  for (let i = 0; i < 35; i++) {
    const t = i / 35;
    const lx = 260 + t * 160;
    const ly = 370 - Math.sin(t * Math.PI) * 26;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + (Math.random() - 0.5) * 8 + 4, ly - 8 - Math.random() * 8);
    ctx.stroke();

    const rx = 604 + t * 160;
    const ry = 375 - Math.sin(t * Math.PI) * 26;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx + (Math.random() - 0.5) * 8 - 4, ry - 8 - Math.random() * 8);
    ctx.stroke();
  }

  // 4. Lips natural rose/coral color gradient
  const lipsGrad = ctx.createRadialGradient(512, 680, 20, 512, 680, 130);
  lipsGrad.addColorStop(0, "rgba(185, 90, 85, 0.65)");
  lipsGrad.addColorStop(0.7, "rgba(165, 75, 70, 0.4)");
  lipsGrad.addColorStop(1, "rgba(165, 75, 70, 0)");
  ctx.fillStyle = lipsGrad;
  ctx.beginPath();
  ctx.ellipse(512, 680, 120, 50, 0, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  return texture;
}

export default function TalkingHeadAvatar({
  state,
  amplitude = 0,
  defaultMode = "expressive",
}: TalkingHeadAvatarProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modelMode, setModelMode] = useState<AvatarModelMode>(defaultMode);

  const stateRef = useRef(state);
  const ampRef = useRef(amplitude);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { ampRef.current = amplitude; }, [amplitude]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let animId: number;
    let morphTargets: Record<string, number> = {};
    let allFaceMeshes: THREE.Mesh[] = [];
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
    renderer.toneMappingExposure = 1.18;
    mount.appendChild(renderer.domElement);

    // ── 2. Studio Lighting Setup ─────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));

    // Key Light - warm skin specular highlights
    const key = new THREE.DirectionalLight(0xfff4e5, 3.4);
    key.position.set(1.5, 2.2, 3);
    scene.add(key);

    // Fill Light - cool soft contours
    const fill = new THREE.DirectionalLight(0x00f2fe, 1.8);
    fill.position.set(-2, 1, 2);
    scene.add(fill);

    // Dynamic State Rim Light
    const rim = new THREE.PointLight(0xa78bfa, 3.5, 8);
    rim.position.set(0, 2, -1.8);
    scene.add(rim);

    // Warm Subsurface Backlight
    const sssLight = new THREE.DirectionalLight(0xff7b68, 1.2);
    sssLight.position.set(0, -0.5, -2);
    scene.add(sssLight);

    // ── 3. Soundwave Audio Halo Rings ────────────────────────────────────────
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

    // ── 4. Load 3D Model based on active Mode ────────────────────────────────
    async function loadActiveModel() {
      try {
        setLoading(true);
        setError(null);

        // Remove existing model if any
        if (modelGroup) {
          scene.remove(modelGroup);
          modelGroup = null;
          allFaceMeshes = [];
          morphTargets = {};
        }

        await MeshoptDecoder.ready;

        const ktx2Loader = new KTX2Loader();
        ktx2Loader.setTranscoderPath("/basis/");
        ktx2Loader.detectSupport(renderer);

        const loader = new GLTFLoader();
        loader.setKTX2Loader(ktx2Loader);
        loader.setMeshoptDecoder(MeshoptDecoder);

        const textureLoader = new THREE.TextureLoader();
        const skinPoreBumpMap = createSkinPoreBumpMap();

        if (modelMode === "photorealistic") {
          // ── MODE A: Photorealistic Lee Perry Smith HD 3D Scan ───────────────
          const hdSkinTexture = textureLoader.load("/skin_diffuse.jpg", (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.flipY = true; // Correct vertical UV alignment
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
          });

          const hdSkinMat = new THREE.MeshStandardMaterial({
            map: hdSkinTexture,
            bumpMap: skinPoreBumpMap,
            bumpScale: 0.004,
            roughness: 0.46,
            metalness: 0.02,
            color: 0xffffff,
          });

          loader.load(
            "/avatar.glb",
            (gltf) => {
              modelGroup = gltf.scene;

              const box = new THREE.Box3().setFromObject(modelGroup);
              const center = box.getCenter(new THREE.Vector3());
              const size = box.getSize(new THREE.Vector3());

              modelGroup.position.sub(center);
              const maxDim = Math.max(size.x, size.y, size.z);
              if (maxDim > 0) {
                modelGroup.scale.setScalar(1.2 / maxDim);
              }
              modelGroup.position.y += 0.04;

              modelGroup.traverse((child) => {
                const mesh = child as THREE.Mesh;
                if (mesh.isMesh) {
                  mesh.material = hdSkinMat;
                }
              });

              scene.add(modelGroup);
              setLoading(false);
            },
            undefined,
            (err) => {
              console.error("avatar.glb load error:", err);
              setError("Initializing photorealistic presentation...");
              setLoading(false);
            }
          );
        } else {
          // ── MODE B: Expressive ARKit Viseme Avatar with Photorealistic Facial Features ─
          const eyeTexture = createRealisticEyeTexture();
          const faceCapSkinTexture = createFaceCapSkinTexture();

          loader.load(
            "/facecap.glb",
            (gltf) => {
              modelGroup = gltf.scene;

              const box = new THREE.Box3().setFromObject(modelGroup);
              const center = box.getCenter(new THREE.Vector3());
              const size = box.getSize(new THREE.Vector3());

              modelGroup.position.sub(center);
              const maxDim = Math.max(size.x, size.y, size.z);
              if (maxDim > 0) {
                modelGroup.scale.setScalar(1.15 / maxDim);
              }
              modelGroup.position.y += 0.05;

              modelGroup.traverse((child) => {
                const mesh = child as THREE.Mesh;
                if (mesh.isMesh) {
                  const hasMorphs = mesh.morphTargetDictionary && Object.keys(mesh.morphTargetDictionary).length > 0;

                  if (hasMorphs) {
                    // 1. MAIN HEAD MESH - Has ARKit blendshapes for lip sync & expressions
                    allFaceMeshes.push(mesh);
                    Object.assign(morphTargets, mesh.morphTargetDictionary);

                    mesh.material = new THREE.MeshStandardMaterial({
                      map: faceCapSkinTexture,
                      bumpMap: skinPoreBumpMap,
                      bumpScale: 0.005,
                      roughness: 0.50,
                      metalness: 0.02,
                      color: 0xffffff,
                    });
                  } else {
                    // Check bounding box to distinguish teeth from eyes
                    mesh.geometry.computeBoundingBox();
                    const meshBox = mesh.geometry.boundingBox;
                    const meshCenter = meshBox ? meshBox.getCenter(new THREE.Vector3()) : new THREE.Vector3();
                    const meshSize = meshBox ? meshBox.getSize(new THREE.Vector3()) : new THREE.Vector3();

                    if (meshCenter.y < 0 && meshSize.y < 5.0) {
                      // 2. TEETH MESH
                      mesh.material = new THREE.MeshStandardMaterial({
                        color: 0xf0ece1,
                        roughness: 0.25,
                        metalness: 0.0,
                      });
                    } else {
                      // 3. EYE MESHES (eyeLeft & eyeRight) - Glossy eyeball with pupil, iris & sclera
                      mesh.material = new THREE.MeshStandardMaterial({
                        map: eyeTexture,
                        roughness: 0.05,
                        metalness: 0.1,
                      });
                    }
                  }
                }
              });

              scene.add(modelGroup);
              setLoading(false);
            },
            undefined,
            (err) => {
              console.error("facecap.glb load error:", err);
              setError("Initializing avatar presentation...");
              setLoading(false);
            }
          );
        }
      } catch (e: any) {
        console.error("3D avatar init error:", e);
        setLoading(false);
      }
    }

    loadActiveModel();

    // ── 5. Morph Target Setter Helper ────────────────────────────────────────
    function setMorph(names: string[], target: number, speed = 0.2) {
      if (!allFaceMeshes.length) return;
      for (const mesh of allFaceMeshes) {
        if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) continue;
        for (const name of names) {
          const idx = mesh.morphTargetDictionary[name];
          if (idx !== undefined && idx < mesh.morphTargetInfluences.length) {
            const cur = mesh.morphTargetInfluences[idx] ?? 0;
            mesh.morphTargetInfluences[idx] = THREE.MathUtils.lerp(cur, target, speed);
          }
        }
      }
    }

    // ── 6. Animation Loop: Speech, Eyeblink & Head Sway ───────────────────────
    const t0 = performance.now();
    let visemeTimer = 0;
    let currentViseme = 0;
    let gazeTimer = 0;
    let gazeTargetX = 0;
    let gazeTargetY = 0;

    function animate() {
      animId = requestAnimationFrame(animate);
      const t = (performance.now() - t0) * 0.001;
      const s = stateRef.current;
      const amp = ampRef.current;

      const isSpeaking = s === "speaking" || amp > 0.015;
      const speakAmp = isSpeaking
        ? Math.max(amp, 0.5 + Math.sin(t * 14) * 0.3 + Math.sin(t * 7.5) * 0.2)
        : amp;

      // Morph Target Animation for Expressive model (Lip Sync + Eyes)
      if (allFaceMeshes.length > 0) {
        // A. Viseme Lip Syncing
        if (isSpeaking) {
          visemeTimer += 1 / 60;
          if (visemeTimer > 0.07 + Math.random() * 0.03) {
            visemeTimer = 0;
            currentViseme = (currentViseme + 1) % VISEME_SHAPES.length;
          }
          setMorph([...MOUTH_OPEN_TARGETS, ...LIP_TARGETS, ...SMILE_TARGETS], 0, 0.3);
          setMorph(VISEME_SHAPES[currentViseme], speakAmp, 0.4);
          setMorph(MOUTH_OPEN_TARGETS, speakAmp * 0.85, 0.35);
        } else {
          setMorph([...MOUTH_OPEN_TARGETS, ...LIP_TARGETS], 0, 0.15);
          setMorph(SMILE_TARGETS, 0.08, 0.05);
        }

        // B. Realistic Eye Blinking
        const blinkCycle = t % 3.6;
        const isBlinking = blinkCycle > 3.45;
        const blinkVal = isBlinking ? Math.sin((blinkCycle - 3.45) * Math.PI / 0.15) : 0;
        setMorph(BLINK_L, blinkVal, 0.5);
        setMorph(BLINK_R, blinkVal, 0.5);

        // C. Natural Eye Gaze Movements
        gazeTimer += 1 / 60;
        if (gazeTimer > 2.5 + Math.random() * 2.0) {
          gazeTimer = 0;
          gazeTargetX = (Math.random() - 0.5) * 0.18;
          gazeTargetY = (Math.random() - 0.5) * 0.12;
        }

        if (gazeTargetX > 0) {
          setMorph(["eyeLookOut_R", "eyeLookIn_L"], gazeTargetX, 0.1);
          setMorph(["eyeLookIn_R", "eyeLookOut_L"], 0, 0.1);
        } else {
          setMorph(["eyeLookIn_R", "eyeLookOut_L"], -gazeTargetX, 0.1);
          setMorph(["eyeLookOut_R", "eyeLookIn_L"], 0, 0.1);
        }

        if (gazeTargetY > 0) {
          setMorph(["eyeLookUp_L", "eyeLookUp_R"], gazeTargetY, 0.1);
          setMorph(["eyeLookDown_L", "eyeLookDown_R"], 0, 0.1);
        } else {
          setMorph(["eyeLookDown_L", "eyeLookDown_R"], -gazeTargetY, 0.1);
          setMorph(["eyeLookUp_L", "eyeLookUp_R"], 0, 0.1);
        }

        // D. Brow Expressions by State
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

      // State Rim Lighting Color
      const targetRimColor =
        s === "listening" ? 0x00f5a0 :
          s === "thinking" ? 0xfbbf24 :
            s === "speaking" ? 0xec4899 :
              0xa78bfa;
      rim.color.lerp(new THREE.Color(targetRimColor), 0.06);

      // Model Idle Sway & Head Movement
      if (modelGroup) {
        modelGroup.rotation.y = Math.sin(t * 0.7) * 0.08;
        const talkNod = isSpeaking ? Math.sin(t * 12) * 0.04 * speakAmp : 0;
        modelGroup.rotation.x = Math.sin(t * 1.0) * 0.03 + talkNod;
        modelGroup.rotation.z = Math.cos(t * 0.6) * 0.02;
      }

      // Halo Rings
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
  }, [modelMode]);

  return (
    <div className="relative w-full h-full flex items-center justify-center pointer-events-none">
      {/* Model Mode Switcher Overlay */}
      <div className="absolute top-2 right-2 z-20 pointer-events-auto flex items-center gap-1.5 bg-slate-900/70 p-1 rounded-full border border-slate-700/60 backdrop-blur-md shadow-xl">
        <button
          onClick={() => setModelMode("expressive")}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-all duration-300 ${
            modelMode === "expressive"
              ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30"
              : "text-slate-300 hover:text-white"
          }`}
          title="ARKit Viseme Talking Head with Lip Sync & Eye Movement"
        >
          🗣️ Talking Avatar (Lip Sync & Eyes)
        </button>

        <button
          onClick={() => setModelMode("photorealistic")}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-all duration-300 ${
            modelMode === "photorealistic"
              ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30"
              : "text-slate-300 hover:text-white"
          }`}
          title="Photorealistic 3D Human Head Scan"
        >
          🌟 Photorealistic 3D Scan
        </button>
      </div>

      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-black/50 backdrop-blur-md rounded-2xl p-6 text-center pointer-events-auto">
          <div className="w-10 h-10 border-4 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
          <p className="text-xs font-medium text-cyan-300 tracking-wider uppercase">
            Loading {modelMode === "expressive" ? "ARKit Talking Head" : "Photorealistic 3D Scan"}…
          </p>
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

