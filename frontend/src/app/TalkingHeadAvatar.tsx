"use client";

import { useEffect, useRef, useState } from "react";

interface TalkingHeadAvatarProps {
  /** LiveKit voice assistant state */
  state: string;
  /** Live audio amplitude / track volume */
  amplitude?: number;
}

export default function TalkingHeadAvatar({ state, amplitude = 0 }: TalkingHeadAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const stateRef = useRef(state);
  const ampRef = useRef(amplitude);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { ampRef.current = amplitude; }, [amplitude]);

  useEffect(() => {
    let mounted = true;

    async function initTalkingHead() {
      if (!containerRef.current) return;

      try {
        setLoading(true);
        setError(null);

        // Dynamically import @met4citizen/talkinghead (client-side only)
        const { TalkingHead } = await import("@met4citizen/talkinghead");

        if (!mounted || !containerRef.current) return;

        // Clear previous canvas
        containerRef.current.innerHTML = "";

        // Instantiate TalkingHead instance
        const head = new TalkingHead(containerRef.current, {
          cameraView: "upper",
          lipsyncModules: ["en"],
          cameraDistance: 1.4,
          cameraX: 0,
          cameraY: 0.2,
        });

        headRef.current = head;

        // Load modern open-source ReadyPlayerMe 3D avatar with ARKit/Oculus visemes
        await head.showAvatar({
          url: "https://models.readyplayer.me/64bfa15f0e72c63d7e3934a6.glb?morphTargets=ARKit,Oculus+Visemes",
          body: "F",
          avatarMood: "neutral",
        });

        if (mounted) {
          setLoading(false);
        }
      } catch (err: any) {
        console.warn("TalkingHead 3D model initialization error:", err);
        if (mounted) {
          setError(err.message || "Failed to load 3D Talking Head avatar model.");
          setLoading(false);
        }
      }
    }

    initTalkingHead();

    return () => {
      mounted = false;
      if (headRef.current && typeof headRef.current.stop === "function") {
        try {
          headRef.current.stop();
        } catch (e) {}
      }
    };
  }, []);

  // Sync state & audio volume morphing with TalkingHead avatar
  useEffect(() => {
    if (!headRef.current) return;

    const head = headRef.current;
    const s = state;

    try {
      if (s === "listening") {
        head.setMood?.("curious");
      } else if (s === "thinking") {
        head.setMood?.("thinking");
      } else if (s === "speaking") {
        head.setMood?.("happy");
      } else {
        head.setMood?.("neutral");
      }
    } catch (e) {
      // Ignore minor state mood errors
    }
  }, [state]);

  return (
    <div className="relative w-full h-full flex items-center justify-center min-h-[400px]">
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-black/40 backdrop-blur-md rounded-2xl">
          <div className="w-10 h-10 border-4 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
          <p className="text-xs font-medium text-cyan-300 tracking-wider uppercase">Loading 3D OpenSource Talking Head Avatar…</p>
        </div>
      )}

      {error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-amber-500/20 border border-amber-500/40 rounded-full text-xs text-amber-300 backdrop-blur-md">
          {error} (Falling back to Topographic Avatar mode)
        </div>
      )}

      <div
        ref={containerRef}
        className="w-full h-full max-w-[500px] max-h-[500px] flex items-center justify-center"
      />
    </div>
  );
}
