"use client";

import { useEffect, useRef } from "react";

interface TopographicAvatarProps {
  /** Agent state from useVoiceAssistant() */
  state: string;
  /** Audio amplitude 0–1 for lip-sync and reactive glow */
  amplitude?: number;
}

// Color palettes for different states
const STATE_THEMES: Record<string, { primary: string; secondary: string; glow: string }> = {
  idle: { primary: "#00f2fe", secondary: "#4facfe", glow: "rgba(0, 242, 254, 0.4)" },
  listening: { primary: "#00f5a0", secondary: "#00d9f5", glow: "rgba(0, 245, 160, 0.5)" },
  thinking: { primary: "#f6d365", secondary: "#fda085", glow: "rgba(246, 211, 101, 0.5)" },
  speaking: { primary: "#00f2fe", secondary: "#8b5cf6", glow: "rgba(0, 242, 254, 0.6)" },
  connecting: { primary: "#3b82f6", secondary: "#8b5cf6", glow: "rgba(59, 130, 246, 0.4)" },
  disconnected: { primary: "#6b7280", secondary: "#4b5563", glow: "rgba(107, 114, 128, 0.3)" },
};

export default function TopographicAvatar({ state, amplitude = 0 }: TopographicAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const stateRef = useRef(state);
  const ampRef = useRef(amplitude);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { ampRef.current = amplitude; }, [amplitude]);

  useEffect(() => {
    const img = new Image();
    img.src = "/agent_mesh_avatar.png";
    img.onload = () => {
      imgRef.current = img;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let startTime = performance.now();

    function render() {
      animId = requestAnimationFrame(render);
      if (!canvas || !ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      const t = (performance.now() - startTime) * 0.001;

      const s = stateRef.current || "idle";
      const rawAmp = ampRef.current;
      
      // Simulate audio speech modulation if speaking and rawAmp is zero
      const speakingAmp = s === "speaking" 
        ? Math.max(rawAmp, (Math.sin(t * 14) * 0.4 + 0.5) * (0.3 + Math.sin(t * 5) * 0.3))
        : rawAmp;

      const theme = STATE_THEMES[s] || STATE_THEMES.idle;

      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2 - 10;
      const baseRadius = Math.min(width, height) * 0.34;

      // ── 1. Render Outer Soundwave Pulse Rings ──────────────────────────────
      const numRings = s === "speaking" ? 4 : s === "thinking" ? 3 : 2;
      for (let i = 0; i < numRings; i++) {
        const ringScale = 1 + i * 0.18 + (s === "speaking" ? speakingAmp * 0.25 : Math.sin(t * 3 + i) * 0.05);
        const ringAlpha = Math.max(0, 0.4 - i * 0.1 - (ringScale - 1) * 0.5);

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius * ringScale, 0, Math.PI * 2);
        ctx.strokeStyle = theme.primary;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = ringAlpha;
        ctx.shadowColor = theme.primary;
        ctx.shadowBlur = 15;
        ctx.stroke();
        ctx.restore();
      }

      // ── 2. Render Equalizer Audio Bars (Behind Avatar when Speaking) ────────
      if (s === "speaking" || s === "listening") {
        const bars = 24;
        const radius = baseRadius * 1.15;
        ctx.save();
        for (let i = 0; i < bars; i++) {
          const angle = (i / bars) * Math.PI * 2 + t * 0.2;
          const barHeight = 8 + Math.sin(t * 8 + i * 0.8) * 15 * (s === "speaking" ? speakingAmp + 0.3 : 0.2);
          
          const x1 = cx + Math.cos(angle) * radius;
          const y1 = cy + Math.sin(angle) * radius;
          const x2 = cx + Math.cos(angle) * (radius + barHeight);
          const y2 = cy + Math.sin(angle) * (radius + barHeight);

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = i % 2 === 0 ? theme.primary : theme.secondary;
          ctx.lineWidth = 2.5;
          ctx.lineCap = "round";
          ctx.globalAlpha = 0.6;
          ctx.stroke();
        }
        ctx.restore();
      }

      // ── 3. Render Topographic Mesh Face Avatar ─────────────────────────────
      if (imgRef.current) {
        ctx.save();

        // Subtle breathing / speech pulse transform
        const scale = 1 + (s === "speaking" ? speakingAmp * 0.06 : Math.sin(t * 2) * 0.02);
        const imgW = baseRadius * 2 * scale;
        const imgH = baseRadius * 2 * scale;
        const imgX = cx - imgW / 2;
        const imgY = cy - imgH / 2;

        // Glowing backdrop shadow behind face
        ctx.shadowColor = theme.primary;
        ctx.shadowBlur = 25 + (s === "speaking" ? speakingAmp * 30 : 10);

        ctx.drawImage(imgRef.current, imgX, imgY, imgW, imgH);
        ctx.restore();

        // ── 4. Lip-Sync & Mouth Animation Overlay ─────────────────────────────
        // Topographic mouth position relative to face (approx centered near lower 3rd of head)
        const mouthX = cx;
        const mouthY = cy + baseRadius * 0.32;
        const mouthWidth = baseRadius * 0.28 * (1 + speakingAmp * 0.15);
        const mouthOpening = s === "speaking" ? 4 + speakingAmp * 16 : 2;

        ctx.save();
        ctx.beginPath();
        // Upper lip contour
        ctx.moveTo(mouthX - mouthWidth / 2, mouthY);
        ctx.quadraticCurveTo(mouthX, mouthY - mouthOpening, mouthX + mouthWidth / 2, mouthY);
        // Lower lip contour
        ctx.quadraticCurveTo(mouthX, mouthY + mouthOpening * 1.5, mouthX - mouthWidth / 2, mouthY);
        ctx.closePath();

        ctx.fillStyle = theme.primary;
        ctx.globalAlpha = s === "speaking" ? 0.3 + speakingAmp * 0.5 : 0.1;
        ctx.shadowColor = theme.primary;
        ctx.shadowBlur = 15;
        ctx.fill();

        ctx.strokeStyle = theme.primary;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8;
        ctx.stroke();
        ctx.restore();
      }
    }

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <canvas
        ref={canvasRef}
        width={480}
        height={480}
        className="w-full h-full max-w-[420px] max-h-[420px] object-contain drop-shadow-[0_0_35px_rgba(0,242,254,0.3)]"
      />
    </div>
  );
}
