import type { JarvisStatus, JarvisEvent } from "../jarvis-engine";

// WebSocket message types from server to client
export type ServerMessage =
  | { type: "connected"; data: { timestamp: string } }
  | { type: "jarvis-event"; event: JarvisEvent }
  | { type: "project-update"; data: { currentProject: string | null; activeTodos: any[] } }
  | { type: "reminders-update"; data: { reminders: any[] } }
  | { type: "system-stats"; data: { cpu: number; memory: number; uptime: number } }
  | { type: "error"; message: string };

// WebSocket message types from client to server
export type ClientMessage =
  | { type: "ping" }
  | { type: "replay-audio" }
  | { type: "change-microphone"; microphoneIndex: number | null };

export interface JarvisState {
  status: JarvisStatus;
  logs: Array<{ timestamp: string; message: string }>;
  transcription: string;
  response: string;
  confidence: number;
  currentProject: string | null;
  activeTodos: any[];
  reminders: any[];
  systemStats?: { cpu: number; memory: number; uptime: number };
}
