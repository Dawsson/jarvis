import type { JarvisStatus, JarvisEvent } from "../jarvis-engine";
import type { JarvisClaudeSession, SessionMessage, CodeReviewSummary } from "../claude-agent/types";

// Screen view types for the tiling manager
export type ScreenView = "home" | "claude-sessions" | "split";

// Claude session update for real-time streaming
export interface ClaudeSessionUpdate {
  sessionId: string;
  status: JarvisClaudeSession["status"];
  task: string;
  latestMessage?: {
    type: string;
    content: string;
    timestamp: string;
  };
  filesModified: string[];
  filesCreated: string[];
  codeReview?: CodeReviewSummary;
  prUrl?: string;
}

// WebSocket message types from server to client
export type ServerMessage =
  | { type: "connected"; data: { timestamp: string } }
  | { type: "jarvis-event"; event: JarvisEvent }
  | { type: "project-update"; data: { currentProject: string | null; activeTodos: any[] } }
  | { type: "reminders-update"; data: { reminders: any[] } }
  | { type: "system-stats"; data: { cpu: number; memory: number; uptime: number } }
  | { type: "screen-control"; data: { view: ScreenView; sessionId?: string } }
  | { type: "claude-sessions-update"; data: { sessions: ClaudeSessionUpdate[] } }
  | { type: "claude-session-message"; data: { sessionId: string; message: SessionMessage } }
  | { type: "error"; message: string };

// WebSocket message types from client to server
export type ClientMessage =
  | { type: "ping" }
  | { type: "replay-audio" }
  | { type: "change-microphone"; microphoneIndex: number | null }
  | { type: "request-claude-sessions" }
  | { type: "set-view"; view: ScreenView };

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
  currentView?: ScreenView;
}
