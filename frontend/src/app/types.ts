export interface TranscriptSegment {
  id: string;
  role: "user" | "agent";
  text: string;
  timestamp: number;
}
