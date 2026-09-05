"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VoiceAssistantControlBar,
  useVoiceAssistant,
  useChat,
  useTrackVolume,
  useLocalParticipant,
  useRoomContext,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { motion, AnimatePresence } from "framer-motion";
import { TranscriptSegment, ChatThread } from "./types";

const AudioSphere = dynamic(() => import("./AudioSphere"), { ssr: false });

const CHAT_API = "http://localhost:8001";

const THINKING_STAGES = [
  "⚡ Processing prompt…",
  "🧠 Synthesizing response…",
  "✨ Formulating thoughts…",
  "🔍 Refining answer…",
];

// ── Chat API helpers ──────────────────────────────────────────────────────────
async function apiCreateThread(title: string): Promise<ChatThread> {
  const res = await fetch(`${CHAT_API}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return res.json();
}

async function apiLoadThreads(): Promise<ChatThread[]> {
  const res = await fetch(`${CHAT_API}/threads`);
  return res.json();
}

async function apiLoadMessages(threadId: string): Promise<TranscriptSegment[]> {
  const res = await fetch(`${CHAT_API}/threads/${threadId}/messages`);
  return res.json();
}

async function apiSaveMessage(
  threadId: string,
  msg: Omit<TranscriptSegment, "id"> & { id?: string }
) {
  await fetch(`${CHAT_API}/threads/${threadId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(msg),
  });
}

async function apiRenameThread(threadId: string, title: string) {
  await fetch(`${CHAT_API}/threads/${threadId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

async function apiDeleteThread(threadId: string) {
  await fetch(`${CHAT_API}/threads/${threadId}`, { method: "DELETE" });
}

// ── Source icon component ─────────────────────────────────────────────────────
function SourceIcon({ source }: { source: "chat" | "voice" }) {
  return (
    <span
      className={`source-icon source-icon--${source}`}
      title={source === "voice" ? "Said via Voice" : "Sent via Chat"}
    >
      {source === "voice" ? "🎙️" : "💬"}
    </span>
  );
}

// ── Thread sidebar item ───────────────────────────────────────────────────────
function ThreadItem({
  thread,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: {
  thread: ChatThread;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(thread.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commitRename = () => {
    const trimmed = editVal.trim();
    if (trimmed && trimmed !== thread.title) onRename(trimmed);
    setEditing(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      className={`thread-item ${isActive ? "thread-item--active" : ""}`}
      onClick={!editing ? onSelect : undefined}
    >
      <span className="thread-dot" />
      {editing ? (
        <input
          ref={inputRef}
          className="thread-rename-input"
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setEditing(false);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="thread-title">{thread.title}</span>
      )}
      <div className="thread-actions" onClick={(e) => e.stopPropagation()}>
        <button
          className="thread-action-btn"
          title="Rename"
          onClick={() => {
            setEditVal(thread.title);
            setEditing(true);
          }}
        >
          ✏️
        </button>
        <button
          className="thread-action-btn thread-action-btn--danger"
          title="Delete"
          onClick={onDelete}
        >
          🗑️
        </button>
      </div>
    </motion.div>
  );
}

// ── Root component ────────────────────────────────────────────────────────────
export default function Home() {
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Thread state
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [threadsLoaded, setThreadsLoaded] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Load threads from API on mount
  useEffect(() => {
    if (!mounted) return;
    apiLoadThreads()
      .then(async (data) => {
        setThreads(data);
        if (data.length > 0) {
          setActiveThreadId(data[0].id);
        } else {
          // Create a default first thread
          const first = await apiCreateThread("Chat 1");
          setThreads([first]);
          setActiveThreadId(first.id);
        }
        setThreadsLoaded(true);
      })
      .catch(() => setThreadsLoaded(true));
  }, [mounted]);

  const connectToRoom = useCallback(async () => {
    if (connecting || token) return;
    try {
      setConnecting(true);
      const res = await fetch("/api/token");
      const data = await res.json();
      setToken(data.token);
    } catch (e) {
      console.error("Failed to connect:", e);
    } finally {
      setConnecting(false);
    }
  }, [connecting, token]);

  useEffect(() => {
    if (mounted) connectToRoom();
  }, [mounted]);

  const handleNewThread = async () => {
    const title = `Chat ${threads.length + 1}`;
    const t = await apiCreateThread(title);
    setThreads((prev) => [t, ...prev]);
    setActiveThreadId(t.id);
  };

  const handleDeleteThread = async (id: string) => {
    await apiDeleteThread(id);
    const remaining = threads.filter((t) => t.id !== id);
    setThreads(remaining);
    if (activeThreadId === id) {
      if (remaining.length > 0) {
        setActiveThreadId(remaining[0].id);
      } else {
        const t = await apiCreateThread("Chat 1");
        setThreads([t]);
        setActiveThreadId(t.id);
      }
    }
  };

  const handleRenameThread = async (id: string, title: string) => {
    await apiRenameThread(id, title);
    setThreads((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title } : t))
    );
  };

  if (!mounted || !threadsLoaded) {
    return (
      <div className="fullscreen">
        <div className="bg-layer bg-layer-1" />
        <div className="bg-noise" />
      </div>
    );
  }

  return (
    <div className="fullscreen">
      <div className="bg-layer bg-layer-1" />
      <div className="bg-layer bg-layer-2" />
      <div className="bg-layer bg-layer-3" />
      <div className="bg-noise" />

      <header className="top-bar">
        <div className="top-bar-left">
          <button
            className="sidebar-toggle-btn"
            onClick={() => setSidebarOpen((p) => !p)}
            title={sidebarOpen ? "Hide threads" : "Show threads"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
        <div className="brand">
          <span className="brand-dot" />
          <span className="brand-name">Velo Voice AI</span>
        </div>
        <p className="brand-sub">Dual Chat &amp; Voice Workspace • Developed by Omer Khan Jadoon</p>
      </header>

      <div className="app-body">
        {/* Thread Sidebar */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.aside
              className="thread-sidebar"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 240, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
            >
              <div className="sidebar-header">
                <span className="sidebar-title">Threads</span>
                <button className="new-thread-btn" onClick={handleNewThread} title="New Thread">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  New Chat
                </button>
              </div>
              <div className="thread-list">
                <AnimatePresence>
                  {threads.map((t) => (
                    <ThreadItem
                      key={t.id}
                      thread={t}
                      isActive={t.id === activeThreadId}
                      onSelect={() => setActiveThreadId(t.id)}
                      onDelete={() => handleDeleteThread(t.id)}
                      onRename={(title) => handleRenameThread(t.id, title)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Main content */}
        <main className="main-content">
          {!token ? (
            <DisconnectedWorkspace connecting={connecting} onConnect={connectToRoom} />
          ) : (
            <LiveKitRoom
              video={false}
              audio={false}
              token={token}
              serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL || "ws://127.0.0.1:7880"}
              connect={true}
              data-lk-theme="default"
              className="lk-room-fullscreen"
              onDisconnected={() => { setToken(""); setConnecting(false); }}
            >
              <DualInterfaceWorkspace
                activeThreadId={activeThreadId}
                onThreadTitleUpdate={(id, title) =>
                  setThreads((prev) =>
                    prev.map((t) => (t.id === id ? { ...t, title } : t))
                  )
                }
              />
            </LiveKitRoom>
          )}
        </main>
      </div>
    </div>
  );
}

// ── Disconnected placeholder ──────────────────────────────────────────────────
function DisconnectedWorkspace({
  connecting,
  onConnect,
}: {
  connecting: boolean;
  onConnect: () => void;
}) {
  return (
    <div className="workspace-dual">
      <section className="chat-panel">
        <div className="panel-header">
          <div className="panel-title">
            <span className="panel-icon">💬</span>
            <h2>Chat Area</h2>
          </div>
          <span className="panel-badge badge-offline">Connecting</span>
        </div>
        <div className="chat-feed chat-feed--disconnected">
          <div className="chat-empty">
            <div className="empty-icon">💬</div>
            <p className="empty-title">Welcome to Velo AI</p>
            <p className="empty-sub">
              Connecting agent session… ask questions in chat or activate voice interaction.
            </p>
            <button className="connect-action-btn" onClick={onConnect} disabled={connecting}>
              {connecting ? (
                <>
                  <span className="spinner" />
                  Connecting Agent…
                </>
              ) : (
                "⚡ Retry Connection"
              )}
            </button>
          </div>
        </div>
      </section>
      <section className="voice-panel">
        <div className="panel-header">
          <div className="panel-title">
            <span className="panel-icon">🎙️</span>
            <h2>Voice Area</h2>
          </div>
          <div className="status-pill status-pill--idle">
            <span className="s-dot s-dot--idle" />
            <span className="s-label">VOICE OFF</span>
          </div>
        </div>
        <div className="voice-mesh-container">
          <AudioSphere state="idle" amplitude={0} />
        </div>
        <div className="voice-controls">
          <button className="voice-activate-btn" onClick={onConnect} disabled={connecting}>
            <span className="mic-badge">🎙️</span>
            <span>{connecting ? "Connecting Session…" : "Activate Voice Mode"}</span>
          </button>
        </div>
      </section>
    </div>
  );
}

// ── Active workspace ──────────────────────────────────────────────────────────
function DualInterfaceWorkspace({
  activeThreadId,
  onThreadTitleUpdate,
}: {
  activeThreadId: string | null;
  onThreadTitleUpdate: (id: string, title: string) => void;
}) {
  const { state, audioTrack } = useVoiceAssistant();
  const volume = useTrackVolume(audioTrack);
  const chat = useChat();
  const { localParticipant } = useLocalParticipant();

  const [inputMessage, setInputMessage] = useState("");
  const [messages, setMessages] = useState<TranscriptSegment[]>([]);
  const [stageIndex, setStageIndex] = useState(0);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [prevThreadId, setPrevThreadId] = useState<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const savedMsgIds = useRef<Set<string>>(new Set());

  // Load messages when thread changes
  useEffect(() => {
    if (!activeThreadId || activeThreadId === prevThreadId) return;
    setPrevThreadId(activeThreadId);
    setMessages([]);
    savedMsgIds.current.clear();
    apiLoadMessages(activeThreadId).then((msgs) => {
      setMessages(msgs);
      msgs.forEach((m) => savedMsgIds.current.add(m.id));
    });
  }, [activeThreadId]);

  // Persist a new message to the API
  const persistMessage = useCallback(
    async (msg: TranscriptSegment) => {
      if (!activeThreadId || savedMsgIds.current.has(msg.id)) return;
      savedMsgIds.current.add(msg.id);
      await apiSaveMessage(activeThreadId, msg);
    },
    [activeThreadId]
  );

  // Sync LiveKit chat messages (text chat only)
  useEffect(() => {
    if (!chat?.chatMessages) return;
    const formatted: TranscriptSegment[] = chat.chatMessages.map((m) => {
      const isUser =
        localParticipant && m.from?.identity === localParticipant.identity;
      return {
        id: m.id,
        role: (isUser ? "user" : "agent") as "user" | "agent",
        source: "chat",
        text: m.message,
        timestamp: m.timestamp,
      };
    });

    setMessages((prev) => {
      // Merge: keep voice messages, replace/add chat messages
      const voiceMsgs = prev.filter((m) => m.source === "voice");
      const allById = new Map<string, TranscriptSegment>();
      voiceMsgs.forEach((m) => allById.set(m.id, m));
      formatted.forEach((m) => allById.set(m.id, m));
      return Array.from(allById.values()).sort((a, b) => a.timestamp - b.timestamp);
    });

    // Persist new chat messages
    formatted.forEach((m) => persistMessage(m));
    setIsSendingChat(false);
  }, [chat?.chatMessages, localParticipant, persistMessage]);



  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, state, isSendingChat]);

  // Thinking stages cycle
  useEffect(() => {
    if (state !== "thinking") { setStageIndex(0); return; }
    const interval = setInterval(() => {
      setStageIndex((prev) => (prev + 1) % THINKING_STAGES.length);
    }, 1400);
    return () => clearInterval(interval);
  }, [state]);

  // Toggle mic
  const handleToggleVoice = async () => {
    if (!localParticipant) return;
    const next = !isVoiceActive;
    await localParticipant.setMicrophoneEnabled(next);
    setIsVoiceActive(next);
  };

  // Add a voice message bubble to chat and persist it
  const addVoiceMessage = useCallback(
    async (role: "user" | "agent", text: string) => {
      const msg: TranscriptSegment = {
        id: crypto.randomUUID(),
        role,
        source: "voice",
        text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, msg]);
      await persistMessage(msg);
    },
    [persistMessage]
  );


  // Send text chat
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    const text = inputMessage.trim();
    setInputMessage("");
    setIsSendingChat(true);
    try {
      if (chat?.send) await chat.send(text);
    } catch (err) {
      console.error("Error sending chat message:", err);
      setIsSendingChat(false);
    }
  };

  const getVoiceStatusLabel = () => {
    if (!isVoiceActive) return "VOICE DEACTIVATED";
    if (state === "thinking") return THINKING_STAGES[stageIndex];
    if (state === "listening") return "LISTENING";
    if (state === "speaking") return "SPEAKING";
    return "VOICE ACTIVE";
  };

  const getVoiceStatusClass = () => {
    if (!isVoiceActive) return "idle";
    return state || "idle";
  };

  return (
    <div className="workspace-dual">
      {isVoiceActive && <RoomAudioRenderer />}
      {/* Voice transcript listener component */}
      <VoiceTranscriptBridge addVoiceMessage={addVoiceMessage} />

      {/* LEFT: CHAT */}
      <section className="chat-panel">
        <div className="panel-header">
          <div className="panel-title">
            <span className="panel-icon">💬</span>
            <h2>Chat Area</h2>
          </div>
          <span className="panel-badge badge-online">Chat Active</span>
        </div>

        <div className="chat-feed" ref={chatContainerRef}>
          {messages.length === 0 ? (
            <div className="chat-empty">
              <div className="empty-icon">💡</div>
              <p className="empty-title">Ask anything</p>
              <p className="empty-sub">
                Type below or activate voice — all messages appear here with a 💬 or 🎙️ badge.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <motion.div
                key={msg.id}
                className={`chat-bubble chat-bubble--${msg.role}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="bubble-meta">
                  <div className="bubble-author">
                    {msg.role === "user" ? "You" : "Velo AI"}
                  </div>
                  <SourceIcon source={msg.source} />
                </div>
                <div className="bubble-text">{msg.text}</div>
              </motion.div>
            ))
          )}

          {(isSendingChat || state === "thinking") && (
            <motion.div
              className="chat-bubble chat-bubble--agent thinking-bubble"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="bubble-meta">
                <div className="bubble-author">Velo AI</div>
              </div>
              <div className="thinking-status">
                <span>{THINKING_STAGES[stageIndex]}</span>
                <div className="t-dots">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                      transition={{ duration: 0.85, delay: i * 0.2, repeat: Infinity }}
                    >
                      •
                    </motion.span>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </div>

        <form onSubmit={handleSendMessage} className="chat-input-form">
          <input
            type="text"
            className="chat-input"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Type a message to ask Velo AI…"
          />
          <button type="submit" className="chat-send-btn" disabled={!inputMessage.trim()}>
            <span>Send</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
      </section>

      {/* RIGHT: VOICE */}
      <section className="voice-panel">
        <div className="panel-header">
          <div className="panel-title">
            <span className="panel-icon">🎙️</span>
            <h2>Voice Area</h2>
          </div>
          <div className={`status-pill status-pill--${getVoiceStatusClass()}`}>
            <span className={`s-dot s-dot--${getVoiceStatusClass()}`} />
            <span className="s-label">{getVoiceStatusLabel()}</span>
          </div>
        </div>
        <div className="voice-mesh-container">
          <AudioSphere state={isVoiceActive ? state : "idle"} amplitude={isVoiceActive ? volume : 0} />
        </div>
        <div className="voice-controls">
          <button
            onClick={handleToggleVoice}
            className={`voice-activate-btn ${isVoiceActive ? "active" : ""}`}
          >
            <span className="mic-badge">{isVoiceActive ? "🎙️ Voice Active" : "🔇 Voice Off"}</span>
            <span>{isVoiceActive ? "Deactivate Voice Mode" : "Activate Voice Mode"}</span>
          </button>
          {isVoiceActive && (
            <div className="controls-bar-wrap">
              <VoiceAssistantControlBar />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ── Voice transcript bridge ───────────────────────────────────────────────────
// Subscribes to the lk-voice-transcript data channel emitted by agent.py
// whenever a voice turn completes (user spoke or agent responded).
function VoiceTranscriptBridge({
  addVoiceMessage,
}: {
  addVoiceMessage: (role: "user" | "agent", text: string) => Promise<void>;
}) {
  const room = useRoomContext();

  useEffect(() => {
    if (!room) return;

    const handler = (payload: Uint8Array, _participant: unknown, _kind: unknown, topic?: string) => {
      try {
        const str = new TextDecoder().decode(payload);
        const data = JSON.parse(str);
        if (topic === "lk-voice-transcript" || data.source === "voice") {
          const { role, text } = data;
          if (text && (role === "user" || role === "agent")) {
            console.log("[VoiceTranscriptBridge] Received voice turn:", role, text);
            addVoiceMessage(role as "user" | "agent", text);
          }
        }
      } catch {
        // ignore non-JSON or unrelated packets
      }
    };

    room.on("dataReceived", handler);
    return () => { room.off("dataReceived", handler); };
  }, [room, addVoiceMessage]);

  return null;
}
