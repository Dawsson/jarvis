import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { ServerMessage, JarvisState, ScreenView, CodeSessionUpdate } from "../types/websocket";
import type { JarvisStatus } from "../jarvis-engine";
import type { SessionMessage } from "../claude-agent/types";
import { Reactor } from "./components/Reactor";
import { StatDisplay } from "./components/StatDisplay";
import { Header } from "./components/Header";
import { MainView } from "./components/MainView";
import { SystemLogsPanel } from "./components/SystemLogsPanel";
import { ProjectPanel } from "./components/ProjectPanel";
import { MicrophoneSelector } from "./components/MicrophoneSelector";
import type { Theme, SystemStats, Todo, Reminder } from "./components/types";
import { ClaudeSessionsView } from "./components/ClaudeSessionsView";

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
  const [isMuted, setIsMuted] = useState(false);

  // View management state
  const [currentView, setCurrentView] = useState<ScreenView>("home");
  const [codeSessions, setCodeSessions] = useState<CodeSessionUpdate[]>([]);
  const [sessionMessages, setSessionMessages] = useState<Map<string, SessionMessage[]>>(new Map());
  const [focusedSessionId, setFocusedSessionId] = useState<string | undefined>();

  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Time Update
  useEffect(() => {
     const t = setInterval(() => setTime(new Date()), 1000);
     return () => clearInterval(t);
  }, []);

  // Keyboard shortcuts (F for fullscreen, M for mute)
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

    const toggleMute = () => {
      ws.current?.send(JSON.stringify({ type: "toggle-mute" }));
    };

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'm' || e.key === 'M') {
        toggleMute();
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
          fetch(`${url}/api/code-sessions`)
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
        const sessions: CodeSessionUpdate[] = await sessionsRes.json();
        setCodeSessions(sessions);
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
          setCurrentView(msg.data.view);
          if (msg.data.sessionId) {
            setFocusedSessionId(msg.data.sessionId);
          }
          if (msg.data.view === "code-sessions" || msg.data.view === "split") {
            ws.current?.send(JSON.stringify({ type: "request-code-sessions" }));
          }
        } else if (msg.type === "code-sessions-update") {
          setCodeSessions(msg.data.sessions);
        } else if (msg.type === "code-session-message") {
          setSessionMessages(prev => {
            const newMap = new Map(prev);
            const existing = newMap.get(msg.data.sessionId) || [];
            newMap.set(msg.data.sessionId, [...existing, msg.data.message]);
            return newMap;
          });
        } else if (msg.type === "mute-status") {
          setIsMuted(msg.data.muted);
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

  const handleViewChange = (view: ScreenView) => {
    setCurrentView(view);
    ws.current?.send(JSON.stringify({ type: "set-view", view }));
    if (view === "code-sessions" || view === "split") {
      ws.current?.send(JSON.stringify({ type: "request-code-sessions" }));
    }
  };

  const formatUptime = (sec: number) => {
     const h = Math.floor(sec / 3600);
     const m = Math.floor((sec % 3600) / 60);
     return `${h}h ${m}m`;
  };

  const theme: Theme = {
    bg: "#050505",
    fg: "#Eaeaea",
    dim: "#444",
    accent: "#00d9ff",
    warn: "#ff4444",
    success: "#00ff88"
  };

  if (currentView === "code-sessions") {
    return (
      <>
        <style>{`
          .code-sessions-scrollable::-webkit-scrollbar { width: 6px; height: 6px; }
          .code-sessions-scrollable::-webkit-scrollbar-track { background: #0a0a0a; }
          .code-sessions-scrollable::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
          .code-sessions-scrollable::-webkit-scrollbar-thumb:hover { background: #555; }
        `}</style>
        <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
          <ClaudeSessionsView
            sessions={codeSessions}
            sessionMessages={sessionMessages}
            focusedSessionId={focusedSessionId}
            onBack={() => handleViewChange("home")}
            onLoadMessages={(sessionId, messages) => {
              setSessionMessages(prev => {
                const newMap = new Map(prev);
                newMap.set(sessionId, messages);
                return newMap;
              });
            }}
            theme={theme}
          />
        </div>
      </>
    );
  }

  return (
    <div style={{
      width: "100vw", height: "100vh", overflow: "hidden",
      background: theme.bg, color: theme.fg,
      fontFamily: "'Share Tech Mono', monospace",
      position: "relative",
      display: "flex", justifyContent: "center", alignItems: "center"
    }}>

      <Header
        isConnected={isConnected}
        theme={theme}
        claudeSessions={codeSessions}
        time={time}
        selectedMic={selectedMic}
        isMuted={isMuted}
        onViewChange={handleViewChange}
        onToggleMicSelector={() => setShowMicSelector(!showMicSelector)}
      />

      <MainView
        status={status}
        confidence={confidence}
        transcription={transcription}
        response={response}
      />

      <SystemLogsPanel
        systemStats={systemStats}
        logs={logs}
        theme={theme}
        formatUptime={formatUptime}
      />

      <ProjectPanel
        currentProject={currentProject}
        activeTodos={activeTodos}
        reminders={reminders}
        theme={theme}
      />

      <MicrophoneSelector
        show={showMicSelector}
        microphones={microphones}
        selectedMic={selectedMic}
        onMicChange={handleMicChange}
      />

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
