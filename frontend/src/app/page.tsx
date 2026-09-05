"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VoiceAssistantControlBar,
  useVoiceAssistant,
  useChat,
  useTrackVolume,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { motion, AnimatePresence } from "framer-motion";
import { TranscriptSegment } from "./types";

const AudioSphere = dynamic(() => import("./AudioSphere"), { ssr: false });
const TopographicAvatar = dynamic(() => import("./TopographicAvatar"), { ssr: false });
const TalkingHeadAvatar = dynamic(() => import("./TalkingHeadAvatar"), { ssr: false });

// Creative thinking messages that cycle dynamically to keep the user engaged
const THINKING_STAGES = [
  "⚡ Processing prompt…",
  "🧠 Synthesizing knowledge…",
  "✨ Formulating response…",
  "🔍 Refining thoughts…",
];

export type AvatarMode = "talking-head" | "topographic" | "sphere";

export default function Home() {
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [avatarMode, setAvatarMode] = useState<AvatarMode>("talking-head");

  const connectToRoom = async () => {
    try {
      setConnecting(true);
      const res = await fetch("/api/token");
      const data = await res.json();
      setToken(data.token);
    } catch (e) {
      console.error(e);
      setConnecting(false);
    }
  };

  return (
    <div className="fullscreen">
      {/* Animated background layers */}
      <div className="bg-layer bg-layer-1" />
      <div className="bg-layer bg-layer-2" />
      <div className="bg-layer bg-layer-3" />
      <div className="bg-noise" />

      {/* Top bar */}
      <header className="top-bar">
        <div className="brand">
          <span className="brand-dot" />
          <span className="brand-name">Velo Voice AI</span>
        </div>
        
        {/* Avatar mode selector */}
        <div className="avatar-toggle-bar">
          <button
            className={`toggle-btn ${avatarMode === "talking-head" ? "active" : ""}`}
            onClick={() => setAvatarMode("talking-head")}
          >
            🤖 3D Talking Head
          </button>
          <button
            className={`toggle-btn ${avatarMode === "topographic" ? "active" : ""}`}
            onClick={() => setAvatarMode("topographic")}
          >
            👤 Topographic Mesh
          </button>
          <button
            className={`toggle-btn ${avatarMode === "sphere" ? "active" : ""}`}
            onClick={() => setAvatarMode("sphere")}
          >
            🔮 Audio Sphere
          </button>
        </div>

        <p className="brand-sub">Developed by Omer Khan Jadoon</p>
      </header>

      {/* Main content */}
      <main className="main-content">
        {!token ? (
          <LandingView
            connecting={connecting}
            onConnect={connectToRoom}
            avatarMode={avatarMode}
          />
        ) : (
          <LiveKitRoom
            video={false}
            audio={true}
            token={token}
            serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL || "ws://127.0.0.1:7880"}
            connect={true}
            data-lk-theme="default"
            className="lk-room-fullscreen"
            onDisconnected={() => { setToken(""); setConnecting(false); }}
          >
            <AgentUI avatarMode={avatarMode} />
            <RoomAudioRenderer />
          </LiveKitRoom>
        )}
      </main>
    </div>
  );
}

/* ── Landing (before connected) ──────────────────────────────────────────── */
function LandingView({
  connecting,
  onConnect,
  avatarMode,
}: {
  connecting: boolean;
  onConnect: () => void;
  avatarMode: AvatarMode;
}) {
  return (
    <motion.div
      className="landing"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
    >
      <motion.h1
        className="landing-title"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6 }}
      >
        Talk to Velo AI
      </motion.h1>

      <motion.p
        className="landing-sub"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.6 }}
      >
        OpenSource 3D Talking Head with Viseme Lip-Sync & Low Latency.
      </motion.p>

      {/* Idle avatar preview */}
      <div className="sphere-wrap">
        {avatarMode === "talking-head" ? (
          <TalkingHeadAvatar state="idle" amplitude={0} />
        ) : avatarMode === "topographic" ? (
          <TopographicAvatar state="idle" amplitude={0} />
        ) : (
          <AudioSphere state="idle" />
        )}
      </div>

      <motion.button
        className="start-btn"
        onClick={onConnect}
        disabled={connecting}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.97 }}
      >
        {connecting ? (
          <span className="btn-inner">
            <span className="spinner" />
            Connecting…
          </span>
        ) : (
          <span className="btn-inner">
            <span className="mic-icon">🎙</span>
            Start Conversation
          </span>
        )}
      </motion.button>
    </motion.div>
  );
}

/* ── Agent UI (after connected) ──────────────────────────────────────────── */
function AgentUI({ avatarMode }: { avatarMode: AvatarMode }) {
  const { state, audioTrack } = useVoiceAssistant();
  const volume = useTrackVolume(audioTrack);
  const chat = useChat();

  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [stageIndex, setStageIndex] = useState(0);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Cycle thinking stages dynamically every 1.4s when thinking
  useEffect(() => {
    if (state !== "thinking") {
      setStageIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setStageIndex((prev) => (prev + 1) % THINKING_STAGES.length);
    }, 1400);

    return () => clearInterval(interval);
  }, [state]);

  useEffect(() => {
    if (!chat?.chatMessages?.length) return;
    setTranscript(
      chat.chatMessages.map((m) => ({
        id: m.id,
        role: m.from?.isAgent ? "agent" : "user",
        text: m.message,
        timestamp: m.timestamp,
      }))
    );
  }, [chat?.chatMessages]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  const STATE_LABEL: Record<string, string> = {
    connecting: "Connecting…",
    initializing: "Initializing…",
    idle: "Ready",
    listening: "Listening",
    thinking: THINKING_STAGES[stageIndex],
    speaking: "Speaking",
  };

  return (
    <div className="agent-screen">
      {/* Status pill — top center */}
      <motion.div
        className={`status-pill status-pill--${state}`}
        layout
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        <span className={`s-dot s-dot--${state}`} />
        <AnimatePresence mode="wait">
          <motion.span
            key={STATE_LABEL[state] ?? state}
            className="s-label"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.2 }}
          >
            {STATE_LABEL[state] ?? state}
          </motion.span>
        </AnimatePresence>
      </motion.div>

      {/* Hero Agent Avatar — reacts visually to state & speech volume */}
      <div className="hero-sphere">
        {avatarMode === "talking-head" ? (
          <TalkingHeadAvatar state={state} amplitude={volume} />
        ) : avatarMode === "topographic" ? (
          <TopographicAvatar state={state} amplitude={volume} />
        ) : (
          <AudioSphere state={state} amplitude={volume} />
        )}
      </div>

      {/* Transcript — bottom floating panel */}
      <AnimatePresence>
        {transcript.length > 0 && (
          <motion.div
            className="transcript-float"
            ref={transcriptRef}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
          >
            {transcript.slice(-6).map((seg) => (
              <motion.div
                key={seg.id}
                className={`t-bubble t-bubble--${seg.role}`}
                initial={{ opacity: 0, x: seg.role === "user" ? 16 : -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25 }}
              >
                <span className="t-who">{seg.role === "user" ? "You" : "Velo"}</span>
                <p>{seg.text}</p>
              </motion.div>
            ))}

            {/* Thinking status indicator in transcript */}
            {state === "thinking" && (
              <motion.div
                key="thinking"
                className="t-bubble t-bubble--agent thinking-bubble"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <span className="t-who">Velo</span>
                <div className="t-thinking-content">
                  <span className="t-stage-text">{THINKING_STAGES[stageIndex]}</span>
                  <div className="t-dots">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
                        transition={{ duration: 0.85, delay: i * 0.2, repeat: Infinity }}
                      >•</motion.span>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls bar — bottom */}
      <div className="controls-bar">
        <VoiceAssistantControlBar />
      </div>
    </div>
  );
}
