export type MessageSource = "chat" | "voice";

export interface TranscriptSegment {
  id: string;
  role: "user" | "agent";
  source: MessageSource;
  text: string;
  timestamp: number;
}

export interface ChatThread {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}
