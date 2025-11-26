import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { ServerMessage, JarvisState, ScreenView, ClaudeSessionUpdate } from "../types/websocket";
import type { JarvisStatus } from "../jarvis-engine";
import type { SessionMessage } from "../claude-agent/types";

// --- Types ---
interface Reminder {
  id: string;
  text: string;
  scheduledTime: string;
}

interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

interface SystemStats {
  cpu: number;
  memory: number;
  uptime: number;
}

// --- Components ---

// 1. Large Complex Reactor (Arc Style)
const Reactor = ({ status, confidence }: { status: JarvisStatus, confidence: number }) => {
  const isIdle = status === "idle";
  
  // Only animate for high energy states (Processing, Recording, Wake Word)
  const isHighEnergy = status === "processing" || status === "recording" || status === "wake-word-detected";
  
  // Colors (Blue/Neutral)
  const baseColor = "#444";
  const activeColor = "#00d9ff"; 
  const recordColor = "#ff4444";
  const wakeColor = "#fff";
  const listeningColor = "#888"; // Neutral for active listening

  const primaryColor = status === "recording" ? recordColor 
    : status === "wake-word-detected" ? wakeColor
    : status === "listening" ? listeningColor
    : isIdle ? baseColor 
    : activeColor;

  return (
    <div style={{ position: "relative", width: 450, height: 450, display: "flex", justifyContent: "center", alignItems: "center" }}>
      
      {/* Core Glow - Only active in high energy */}
      <div style={{
        position: "absolute", width: "120px", height: "120px", borderRadius: "50%",
        background: primaryColor, opacity: isHighEnergy ? 0.4 : 0.05, filter: "blur(30px)",
        transition: "all 0.5s ease",
        animation: isHighEnergy ? "pulse 2s ease-in-out infinite" : "none"
      }} />

      {/* Core Solid Ring - Static */}
      <svg width="100%" height="100%" style={{ position: "absolute", opacity: 0.8, transition: "all 0.3s ease" }}>
          <circle cx="225" cy="225" r="70" fill="none" stroke={primaryColor} strokeWidth="4" opacity={isHighEnergy ? 0.9 : 0.2} />
          <circle cx="225" cy="225" r="60" fill="none" stroke={primaryColor} strokeWidth="1" opacity={0.5} />
      </svg>

      {/* Inner Rotating Dashes - Spin only on High Energy */}
      <svg width="100%" height="100%" style={{ position: "absolute", animation: isHighEnergy ? "spin 4s linear infinite" : "none" }}>
         <circle cx="225" cy="225" r="90" fill="none" stroke={primaryColor} strokeWidth="8" strokeDasharray="20 40" opacity={isHighEnergy ? 0.6 : 0.1} />
      </svg>
      
      {/* Middle Geometric Ring - Spin only on High Energy */}
      <svg width="100%" height="100%" style={{ position: "absolute", animation: isHighEnergy ? "spin 10s linear infinite reverse" : "none" }}>
         <circle cx="225" cy="225" r="120" fill="none" stroke={primaryColor} strokeWidth="1" opacity={0.3} />
         <path d="M225 95 L230 105 L220 105 Z" fill={primaryColor} />
         <path d="M225 355 L230 345 L220 345 Z" fill={primaryColor} />
         <path d="M95 225 L105 230 L105 220 Z" fill={primaryColor} />
         <path d="M355 225 L345 230 L345 220 Z" fill={primaryColor} />
      </svg>

      {/* Segmented Ring - Spin only on High Energy */}
      <svg width="100%" height="100%" style={{ position: "absolute", animation: isHighEnergy ? "spin 30s linear infinite" : "none" }}>
         <circle cx="225" cy="225" r="160" fill="none" stroke={primaryColor} strokeWidth="20" strokeDasharray="2 10" opacity={isHighEnergy ? 0.15 : 0.05} />
         <circle cx="225" cy="225" r="180" fill="none" stroke={primaryColor} strokeWidth="1" strokeDasharray="40 40" opacity={0.2} />
      </svg>

      {/* Outer Scale - Static */}
      <svg width="100%" height="100%" style={{ position: "absolute" }}>
         {Array.from({ length: 60 }).map((_, i) => (
           <line
             key={i}
             x1="225" y1="20"
             x2="225" y2={i % 5 === 0 ? "40" : "30"}
             stroke={primaryColor}
             strokeWidth={i % 5 === 0 ? 2 : 1}
             transform={`rotate(${i * 6} 225 225)`}
             opacity={isHighEnergy ? (i % 5 === 0 ? 0.5 : 0.2) : 0.1}
           />
        ))}
      </svg>

      {/* Center Status Text */}
      <div style={{ zIndex: 10, textAlign: "center", color: primaryColor, transition: "color 0.3s ease", textShadow: `0 0 10px ${primaryColor}` }}>
         <div style={{ fontSize: "14px", letterSpacing: "3px", fontWeight: "bold" }}>
            {status === "idle" ? "STANDBY" : status.toUpperCase().replace(/-/g, " ")}
         </div>
         {confidence > 0 && isHighEnergy && (
             <div style={{ fontSize: "11px", marginTop: "6px", opacity: 0.8, fontFamily: "monospace" }}>CONF: {(confidence * 100).toFixed(0)}%</div>
         )}
      </div>
    </div>
  );
};

// 2. Stat Display (Compact)
const StatDisplay = ({ label, value, unit = "" }: { label: string, value: string | number, unit?: string }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
    <div style={{ fontSize: "9px", color: "#666", letterSpacing: "1px" }}>{label}</div>
    <div style={{ fontSize: "12px", color: "#aaa", fontFamily: "monospace" }}>{value}{unit}</div>
  </div>
);

// 3. Claude Sessions View Component
const ClaudeSessionsView = ({
  sessions,
  sessionMessages,
  focusedSessionId,
  onBack,
  theme
}: {
  sessions: ClaudeSessionUpdate[];
  sessionMessages: Map<string, SessionMessage[]>;
  focusedSessionId?: string;
  onBack: () => void;
  theme: { bg: string; fg: string; dim: string; accent: string; warn: string; success: string };
}) => {
  const [selectedSession, setSelectedSession] = useState<string | null>(focusedSessionId || null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessionMessages]);

  const getStatusColor = (status: ClaudeSessionUpdate["status"]) => {
    switch (status) {
      case "active": return theme.accent;
      case "completed": return theme.success;
      case "error": return theme.warn;
      default: return theme.dim;
    }
  };

  const getStatusIcon = (status: ClaudeSessionUpdate["status"]) => {
    switch (status) {
      case "active": return "⚡";
      case "completed": return "✓";
      case "error": return "✗";
      default: return "○";
    }
  };

  const formatMessageContent = (msg: SessionMessage): string => {
    try {
      const content = msg.content as any;
      if (typeof content === 'string') return content.substring(0, 200);

      // Handle different message types
      if (content.type === 'assistant') {
        // Extract text from assistant messages
        if (content.message?.content) {
          const textContent = content.message.content.find((c: any) => c.type === 'text');
          if (textContent) return textContent.text.substring(0, 300);
        }
        return 'Assistant thinking...';
      }

      if (content.type === 'user') {
        if (content.message?.content) {
          const textContent = content.message.content.find((c: any) => c.type === 'text');
          if (textContent) return textContent.text.substring(0, 300);
        }
        return 'User input';
      }

      if (content.type === 'result') {
        return `Tool result: ${JSON.stringify(content).substring(0, 200)}...`;
      }

      return JSON.stringify(content).substring(0, 200);
    } catch {
      return 'Message content';
    }
  };

  const getMessageTypeIcon = (type: string): string => {
    switch (type) {
      case 'assistant': return '🤖';
      case 'user': return '👤';
      case 'result': return '📋';
      case 'system': return '⚙️';
      default: return '💬';
    }
  };

  const selectedSessionData = selectedSession
    ? sessions.find(s => s.sessionId === selectedSession)
    : null;
  const selectedMessages = selectedSession
    ? sessionMessages.get(selectedSession) || []
    : [];

  return (
    <div style={{
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      background: theme.bg,
      color: theme.fg,
      fontFamily: "'Share Tech Mono', monospace",
    }}>
      {/* Header */}
      <div style={{
        padding: "20px",
        borderBottom: `1px solid ${theme.dim}`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div>
          <div style={{ fontSize: "20px", fontWeight: "bold", letterSpacing: "4px" }}>
            CLAUDE CODE SESSIONS
          </div>
          <div style={{ fontSize: "11px", color: theme.dim, marginTop: "4px" }}>
            {sessions.length} session{sessions.length !== 1 ? 's' : ''} •
            {sessions.filter(s => s.status === 'active').length} active
          </div>
        </div>
        <button
          onClick={onBack}
          style={{
            background: "transparent",
            border: `1px solid ${theme.dim}`,
            color: theme.fg,
            padding: "8px 16px",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "11px",
            letterSpacing: "1px",
          }}
        >
          ← BACK TO HOME
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {/* Sessions List (Left Panel) */}
        <div className="claude-sessions-scrollable" style={{
          width: "350px",
          borderRight: `1px solid ${theme.dim}`,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "10px",
          minHeight: 0,
        }}>
          {sessions.length === 0 ? (
            <div style={{
              textAlign: "center",
              padding: "40px 20px",
              color: theme.dim,
            }}>
              <div style={{ fontSize: "40px", marginBottom: "16px" }}>📦</div>
              <div>No Claude sessions yet</div>
              <div style={{ fontSize: "11px", marginTop: "8px" }}>
                Ask Jarvis to create a coding session
              </div>
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.sessionId}
                onClick={() => setSelectedSession(session.sessionId)}
                style={{
                  padding: "12px",
                  marginBottom: "8px",
                  background: selectedSession === session.sessionId ? "#1a1a1a" : "transparent",
                  border: `1px solid ${selectedSession === session.sessionId ? theme.accent : "#222"}`,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                }}>
                  <span style={{ color: getStatusColor(session.status), fontSize: "12px" }}>
                    {getStatusIcon(session.status)} {session.status.toUpperCase()}
                  </span>
                  <span style={{ fontSize: "10px", color: theme.dim }}>
                    {session.sessionId.substring(0, 12)}...
                  </span>
                </div>
                <div style={{
                  fontSize: "13px",
                  color: theme.fg,
                  marginBottom: "6px",
                  lineHeight: "1.4",
                }}>
                  {session.task.length > 80 ? session.task.substring(0, 80) + '...' : session.task}
                </div>
                <div style={{ fontSize: "10px", color: theme.dim }}>
                  {session.filesCreated.length + session.filesModified.length} files changed
                  {session.prUrl && <span style={{ color: theme.success }}> • PR created</span>}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Session Detail (Right Panel) */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {selectedSessionData ? (
            <>
              {/* Session Header */}
              <div style={{
                padding: "16px 20px",
                borderBottom: `1px solid ${theme.dim}`,
                background: "#0a0a0a",
              }}>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "14px", marginBottom: "8px", lineHeight: "1.4" }}>
                      {selectedSessionData.task}
                    </div>
                    <div style={{ display: "flex", gap: "16px", fontSize: "11px", color: theme.dim }}>
                      <span>
                        <span style={{ color: getStatusColor(selectedSessionData.status) }}>
                          {getStatusIcon(selectedSessionData.status)}
                        </span> {selectedSessionData.status}
                      </span>
                      <span>📁 {selectedSessionData.filesCreated.length} created</span>
                      <span>✏️ {selectedSessionData.filesModified.length} modified</span>
                      {selectedSessionData.prUrl && (
                        <a
                          href={selectedSessionData.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: theme.accent, textDecoration: "none" }}
                        >
                          🔗 View PR
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Files List */}
                {(selectedSessionData.filesCreated.length > 0 || selectedSessionData.filesModified.length > 0) && (
                  <div className="claude-sessions-scrollable" style={{
                    marginTop: "12px",
                    padding: "10px",
                    background: "#111",
                    borderRadius: "4px",
                    fontSize: "11px",
                    maxHeight: "120px",
                    overflowY: "auto",
                    overflowX: "hidden",
                  }}>
                    {selectedSessionData.filesCreated.map((f, i) => (
                      <div key={`created-${i}`} style={{ color: theme.success, marginBottom: "2px" }}>
                        + {f}
                      </div>
                    ))}
                    {selectedSessionData.filesModified.map((f, i) => (
                      <div key={`modified-${i}`} style={{ color: theme.accent, marginBottom: "2px" }}>
                        ~ {f}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Messages Stream - Full height scrollable */}
              <div className="claude-sessions-scrollable" style={{
                flex: 1,
                overflowY: "auto",
                overflowX: "hidden",
                padding: "16px 20px",
                background: "#050505",
                minHeight: 0, // Critical for flex scrolling
                display: "flex",
                flexDirection: "column",
              }}>
                {selectedMessages.length === 0 ? (
                  <div style={{ textAlign: "center", color: theme.dim, padding: "40px" }}>
                    {selectedSessionData.status === 'active'
                      ? 'Waiting for messages...'
                      : 'No message history available'}
                  </div>
                ) : (
                  <>
                    {selectedMessages.map((msg, i) => (
                      <div
                        key={i}
                        style={{
                          marginBottom: "12px",
                          padding: "12px",
                          background: msg.type === 'assistant' ? '#0d1117' : '#111',
                          borderLeft: `3px solid ${msg.type === 'assistant' ? theme.accent : msg.type === 'result' ? theme.success : theme.dim}`,
                          fontSize: "12px",
                          lineHeight: "1.6",
                          borderRadius: "4px",
                          flexShrink: 0,
                        }}
                      >
                        <div style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "8px",
                          fontSize: "10px",
                          color: theme.dim,
                          fontWeight: "bold",
                        }}>
                          <span>{getMessageTypeIcon(msg.type)} {msg.type.toUpperCase()}</span>
                          <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div style={{
                          color: "#ccc",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          maxHeight: "none",
                          overflowY: "visible"
                        }}>
                          {formatMessageContent(msg)}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>
            </>
          ) : (
            <div style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: theme.dim,
            }}>
              Select a session to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function App() {
  // State
  const [wsUrl] = useState(() => localStorage.getItem("jarvis-ws-url") || `ws://${window.location.host}/ws`);
  const [status, setStatus] = useState<JarvisStatus>("idle");
  const [logs, setLogs] = useState<Array<{ timestamp: string; message: string }>>([]);
  const [transcription, setTranscription] = useState("");
  const [response, setResponse] = useState("");
  const [confidence, setConfidence] = useState(0);
  const [currentProject, setCurrentProject] = useState<string | null>(null);
  const [activeTodos, setActiveTodos] = useState<Todo[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [systemStats, setSystemStats] = useState<SystemStats>({ cpu: 0, memory: 0, uptime: 0 });
  const [isConnected, setIsConnected] = useState(false);
  const [microphones, setMicrophones] = useState<Array<{ index: number; name: string }>>([]);
  const [selectedMic, setSelectedMic] = useState<number | null>(null);
  const [showMicSelector, setShowMicSelector] = useState(false);
  const [time, setTime] = useState(new Date());

  // View management state
  const [currentView, setCurrentView] = useState<ScreenView>("home");
  const [claudeSessions, setClaudeSessions] = useState<ClaudeSessionUpdate[]>([]);
  const [sessionMessages, setSessionMessages] = useState<Map<string, SessionMessage[]>>(new Map());
  const [focusedSessionId, setFocusedSessionId] = useState<string | undefined>();

  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Time Update
  useEffect(() => {
     const t = setInterval(() => setTime(new Date()), 1000);
     return () => clearInterval(t);
  }, []);

  // Fullscreen toggle (F key)
  useEffect(() => {
    const toggleFullscreen = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((err) => {
          console.error("Error attempting to enable fullscreen:", err);
        });
      } else {
        document.exitFullscreen();
      }
    };

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, []);

  // Initial Load
  useEffect(() => {
    const loadState = async () => {
      try {
        const url = wsUrl.replace("ws://", "http://").replace("wss://", "https://").replace("/ws", "");
        const [stateRes, micsRes, sessionsRes] = await Promise.all([
          fetch(`${url}/api/state`),
          fetch(`${url}/api/microphones`),
          fetch(`${url}/api/claude-sessions`)
        ]);
        const state: JarvisState = await stateRes.json();
        setStatus(state.status);
        setLogs(state.logs);
        setTranscription(state.transcription);
        setResponse(state.response);
        setConfidence(state.confidence);
        setCurrentProject(state.currentProject);
        setActiveTodos(state.activeTodos);
        if (state.reminders) setReminders(state.reminders);
        if (state.currentView) setCurrentView(state.currentView);
        setMicrophones(await micsRes.json());
        const sessions: ClaudeSessionUpdate[] = await sessionsRes.json();
        setClaudeSessions(sessions);
      } catch (err) {
        console.error("Failed to load state", err);
      }
    };
    loadState();
  }, [wsUrl]);

  // WebSocket
  useEffect(() => {
    const connect = () => {
      ws.current = new WebSocket(wsUrl);
      ws.current.onopen = () => { setIsConnected(true); if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current); };
      ws.current.onclose = () => { setIsConnected(false); reconnectTimeoutRef.current = setTimeout(connect, 5000); };
      ws.current.onmessage = (e) => {
        const msg: ServerMessage = JSON.parse(e.data);
        if (msg.type === "jarvis-event") {
          const evt = msg.event;
          if (evt.type === "status") setStatus(evt.data);
          else if (evt.type === "wake-word") setConfidence(evt.data.confidence);
          else if (evt.type === "transcription") setTranscription(evt.data);
          else if (evt.type === "response") setResponse(evt.data);
          else if (evt.type === "log") setLogs(p => [...p.slice(-99), { timestamp: new Date().toISOString(), message: evt.data }]);
        } else if (msg.type === "project-update") {
          setCurrentProject(msg.data.currentProject);
          setActiveTodos(msg.data.activeTodos);
        } else if (msg.type === "reminders-update") {
          setReminders(msg.data.reminders);
        } else if (msg.type === "system-stats") {
          setSystemStats(msg.data);
        } else if (msg.type === "screen-control") {
          // Server is telling us to change view
          setCurrentView(msg.data.view);
          if (msg.data.sessionId) {
            setFocusedSessionId(msg.data.sessionId);
          }
          // Request sessions data when switching to sessions view
          if (msg.data.view === "claude-sessions" || msg.data.view === "split") {
            ws.current?.send(JSON.stringify({ type: "request-claude-sessions" }));
          }
        } else if (msg.type === "claude-sessions-update") {
          // Update the sessions list
          setClaudeSessions(msg.data.sessions);
        } else if (msg.type === "claude-session-message") {
          // Append new message to the session
          setSessionMessages(prev => {
            const newMap = new Map(prev);
            const existing = newMap.get(msg.data.sessionId) || [];
            newMap.set(msg.data.sessionId, [...existing, msg.data.message]);
            return newMap;
          });
        }
      };
    };
    connect();
    return () => ws.current?.close();
  }, [wsUrl]);

  const handleMicChange = (micIndex: number | null) => {
      setSelectedMic(micIndex);
      ws.current?.send(JSON.stringify({ type: "change-microphone", microphoneIndex: micIndex }));
      setShowMicSelector(false);
  };

  // Handle view changes from the UI
  const handleViewChange = (view: ScreenView) => {
    setCurrentView(view);
    ws.current?.send(JSON.stringify({ type: "set-view", view }));
    if (view === "claude-sessions" || view === "split") {
      ws.current?.send(JSON.stringify({ type: "request-claude-sessions" }));
    }
  };

  const formatUptime = (sec: number) => {
     const h = Math.floor(sec / 3600);
     const m = Math.floor((sec % 3600) / 60);
     return `${h}h ${m}m`;
  };

  // Theme Colors
  const theme = {
    bg: "#050505",
    fg: "#Eaeaea",
    dim: "#555",
    accent: "#00d9ff",
    warn: "#ff4444",
    success: "#00ff88"
  };

  // If we're showing the Claude Sessions view, render that instead
  if (currentView === "claude-sessions") {
    return (
      <>
        <style>{`
          /* Custom scrollbar styling for Claude Sessions */
          .claude-sessions-scrollable::-webkit-scrollbar {
            width: 8px;
            height: 8px;
          }
          .claude-sessions-scrollable::-webkit-scrollbar-track {
            background: #0a0a0a;
          }
          .claude-sessions-scrollable::-webkit-scrollbar-thumb {
            background: #333;
            border-radius: 4px;
          }
          .claude-sessions-scrollable::-webkit-scrollbar-thumb:hover {
            background: #555;
          }
        `}</style>
        <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
          <ClaudeSessionsView
            sessions={claudeSessions}
            sessionMessages={sessionMessages}
            focusedSessionId={focusedSessionId}
            onBack={() => handleViewChange("home")}
            theme={theme}
          />
        </div>
      </>
    );
  }

  // Home view (default)
  return (
    <div style={{
      width: "100vw", height: "100vh", overflow: "hidden",
      background: theme.bg, color: theme.fg,
      fontFamily: "'Share Tech Mono', monospace",
      position: "relative",
      display: "flex", justifyContent: "center", alignItems: "center"
    }}>

      {/* Top Header - Previous Style */}
      <div style={{
          position: "absolute", top: 40, left: 40, right: 40,
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          zIndex: 10
      }}>
         {/* Left: Title & Status */}
         <div>
            <div style={{ fontSize: "32px", fontWeight: "bold", letterSpacing: "8px", color: "#fff", marginBottom: "4px" }}>JARVIS</div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", letterSpacing: "2px", color: isConnected ? theme.success : theme.warn }}>
               <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: isConnected ? theme.success : theme.warn }} />
               {isConnected ? "SYSTEM ONLINE" : "OFFLINE"}
            </div>
            {/* View switcher button */}
            {claudeSessions.length > 0 && (
              <button
                onClick={() => handleViewChange("claude-sessions")}
                style={{
                  marginTop: "12px",
                  background: "transparent",
                  border: `1px solid ${claudeSessions.some(s => s.status === 'active') ? theme.accent : theme.dim}`,
                  color: claudeSessions.some(s => s.status === 'active') ? theme.accent : theme.fg,
                  padding: "6px 12px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "10px",
                  letterSpacing: "1px",
                }}
              >
                {claudeSessions.filter(s => s.status === 'active').length > 0
                  ? `⚡ ${claudeSessions.filter(s => s.status === 'active').length} ACTIVE SESSION${claudeSessions.filter(s => s.status === 'active').length !== 1 ? 'S' : ''}`
                  : `📦 ${claudeSessions.length} SESSION${claudeSessions.length !== 1 ? 'S' : ''}`
                }
              </button>
            )}
         </div>

         {/* Right: Time & Mic */}
         <div style={{ textAlign: "right" }}>
             <div style={{ fontSize: "24px", color: "#fff", letterSpacing: "2px" }}>
                {time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
             </div>
             <div
               onClick={() => setShowMicSelector(!showMicSelector)}
               style={{ fontSize: "11px", color: theme.dim, letterSpacing: "1px", cursor: "pointer", marginTop: "4px" }}
             >
                MIC: {selectedMic !== null ? `IDX ${selectedMic}` : "AUTO"} ▼
             </div>
         </div>
      </div>

      {/* Center: Reactor & Conversation */}
      <div style={{ position: "relative", zIndex: 5, display: "flex", flexDirection: "column", alignItems: "center", gap: "40px" }}>
         <Reactor status={status} confidence={confidence} />
         
         {/* Conversation Overlay */}
         <div style={{ textAlign: "center", maxWidth: "700px", minHeight: "100px" }}>
             {transcription && (
                 <div style={{ fontSize: "14px", color: "#888", marginBottom: "12px", fontStyle: "italic" }}>"{transcription}"</div>
             )}
             {response && (
                 <div style={{ fontSize: "22px", color: "#ffffff", lineHeight: "1.6", textShadow: "0 0 15px rgba(255, 255, 255, 0.2)", fontWeight: "300" }}>
                     {response}
                 </div>
             )}
         </div>
      </div>

      {/* Bottom Left: Logs & Stats (Combined) */}
      <div style={{
          position: "absolute", bottom: 40, left: 40, width: "350px",
          display: "flex", flexDirection: "column", gap: "20px", zIndex: 10
      }}>
          {/* System Stats Row */}
          <div style={{ display: "flex", gap: "20px", borderBottom: "1px solid #222", paddingBottom: "10px" }}>
             <StatDisplay label="CPU" value={(systemStats.cpu * 100).toFixed(0)} unit="%" />
             <StatDisplay label="RAM" value={systemStats.memory.toFixed(0)} unit="%" />
             <StatDisplay label="UPTIME" value={formatUptime(systemStats.uptime)} />
          </div>

          {/* Logs */}
          <div>
             <div style={{ fontSize: "10px", color: theme.dim, letterSpacing: "2px", marginBottom: "8px" }}>SYSTEM LOGS</div>
             <div style={{ 
                 height: "150px", overflowY: "hidden", 
                 display: "flex", flexDirection: "column", justifyContent: "flex-end",
                 fontSize: "11px", fontFamily: "monospace", color: "#888"
             }}>
                 {logs.slice(-8).map((log, i) => (
                    <div key={i} style={{ marginBottom: "4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        <span style={{ color: "#444", marginRight: "6px" }}>{log.timestamp.split("T")[1].split(".")[0]}</span>
                        <span style={{ color: log.message.includes("ERR") ? theme.warn : "#aaa" }}>{log.message}</span>
                    </div>
                 ))}
             </div>
          </div>
      </div>

      {/* Bottom Right: Protocol & Reminders */}
      <div style={{
          position: "absolute", bottom: 40, right: 40, width: "300px",
          display: "flex", flexDirection: "column", gap: "24px", zIndex: 10,
          textAlign: "right", alignItems: "flex-end"
      }}>
          {/* Project */}
          <div>
              <div style={{ fontSize: "10px", color: theme.dim, letterSpacing: "2px", marginBottom: "4px" }}>ACTIVE PROTOCOL</div>
              <div style={{ fontSize: "16px", color: "#fff", fontWeight: "bold" }}>{currentProject || "IDLE"}</div>
          </div>

          {/* Todos */}
          <div>
             <div style={{ fontSize: "10px", color: theme.dim, letterSpacing: "2px", marginBottom: "6px" }}>PENDING OBJECTIVES</div>
             <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end" }}>
                 {activeTodos.length === 0 ? <div style={{ fontSize: "11px", color: "#444" }}>-- No active tasks --</div> : null}
                 {activeTodos.slice(0, 5).map(todo => (
                     <div key={todo.id} style={{ fontSize: "12px", color: "#ccc" }}>
                        {todo.text}
                     </div>
                 ))}
                 {activeTodos.length > 5 && <div style={{ fontSize: "10px", color: "#666" }}>+ {activeTodos.length - 5} more</div>}
             </div>
          </div>

          {/* Reminders (Only if exists) */}
          {reminders.length > 0 && (
              <div>
                 <div style={{ fontSize: "10px", color: theme.dim, letterSpacing: "2px", marginBottom: "6px" }}>EVENTS</div>
                 <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end" }}>
                     {reminders.map(rem => {
                        const date = new Date(rem.scheduledTime);
                        const isSoon = date.getTime() - Date.now() < 3600000;
                         return (
                             <div key={rem.id} style={{ fontSize: "11px", color: isSoon ? theme.accent : "#888" }}>
                                <span style={{ marginRight: "6px", opacity: 0.7 }}>{date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                {rem.text}
                             </div>
                         );
                     })}
                 </div>
              </div>
          )}
      </div>

      {/* Mic Overlay */}
      {showMicSelector && (
        <div style={{
            position: "absolute", top: "80px", right: "40px", width: "220px",
            background: "#111", border: "1px solid #333", padding: "5px", zIndex: 50
        }}>
            <div onClick={() => handleMicChange(null)} style={{ padding: "8px", fontSize: "11px", color: selectedMic === null ? "#fff" : "#888", cursor: "pointer" }}>
                System Default
            </div>
            {microphones.map(mic => (
                <div key={mic.index} onClick={() => handleMicChange(mic.index)} style={{ padding: "8px", fontSize: "11px", color: selectedMic === mic.index ? "#fff" : "#888", cursor: "pointer", borderTop: "1px solid #222" }}>
                    {mic.name}
                </div>
            ))}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes breathe { 0% { opacity: 0.4; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.05); } 100% { opacity: 0.4; transform: scale(1); } }
        @keyframes pulse { 0% { opacity: 0.3; transform: scale(1); } 50% { opacity: 0.6; transform: scale(1.1); } 100% { opacity: 0.3; transform: scale(1); } }
      `}</style>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
