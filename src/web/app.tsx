import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { ServerMessage, JarvisState } from "../types/websocket";
import type { JarvisStatus } from "../jarvis-engine";

function App() {
  const [wsUrl, setWsUrl] = useState(() => {
    const saved = localStorage.getItem("jarvis-ws-url");
    return saved || `ws://${window.location.host}/ws`;
  });
  const [status, setStatus] = useState<JarvisStatus>("idle");
  const [logs, setLogs] = useState<Array<{ timestamp: string; message: string }>>([]);
  const [transcription, setTranscription] = useState("");
  const [response, setResponse] = useState("");
  const [confidence, setConfidence] = useState(0);
  const [currentProject, setCurrentProject] = useState<string | null>(null);
  const [activeTodos, setActiveTodos] = useState<any[]>([]);
  const [wakeWordAnimation, setWakeWordAnimation] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [microphones, setMicrophones] = useState<Array<{ index: number; name: string }>>([]);
  const [selectedMic, setSelectedMic] = useState<number | null>(null);
  const [showMicSelector, setShowMicSelector] = useState(false);

  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error("Error attempting to enable fullscreen:", err);
      });
    } else {
      document.exitFullscreen();
    }
  };

  // Keyboard shortcut for fullscreen (F key)
  useEffect(() => {
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

  // Load initial state from API
  useEffect(() => {
    const loadState = async () => {
      try {
        const url = wsUrl.replace("ws://", "http://").replace("wss://", "https://").replace("/ws", "");
        const [stateResponse, micsResponse] = await Promise.all([
          fetch(`${url}/api/state`),
          fetch(`${url}/api/microphones`),
        ]);
        const state: JarvisState = await stateResponse.json();
        const mics = await micsResponse.json();

        setStatus(state.status);
        setLogs(state.logs);
        setTranscription(state.transcription);
        setResponse(state.response);
        setConfidence(state.confidence);
        setCurrentProject(state.currentProject);
        setActiveTodos(state.activeTodos);
        setMicrophones(mics);
      } catch (error) {
        console.error("Failed to load initial state:", error);
      }
    };
    loadState();
  }, [wsUrl]);

  // WebSocket connection
  useEffect(() => {
    const connect = () => {
      try {
        ws.current = new WebSocket(wsUrl);

        ws.current.onopen = () => {
          console.log("WebSocket connected");
          setIsConnected(true);
          // Clear any pending reconnect timeout since we're connected
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
        };

        ws.current.onmessage = (event) => {
          const message: ServerMessage = JSON.parse(event.data);

          if (message.type === "jarvis-event") {
            const jarvisEvent = message.event;

            if (jarvisEvent.type === "status") {
              setStatus(jarvisEvent.data);
            } else if (jarvisEvent.type === "wake-word") {
              const conf = jarvisEvent.data.confidence;
              setConfidence(conf);
              setWakeWordAnimation(true);
              setTimeout(() => setWakeWordAnimation(false), 1500);

              // Play sound
              const audio = new Audio("/System/Library/Sounds/Glass.aiff");
              audio.play().catch(() => {
                 // Silent fail
              });

            } else if (jarvisEvent.type === "transcription") {
              setTranscription(jarvisEvent.data);
            } else if (jarvisEvent.type === "response") {
              setResponse(jarvisEvent.data);
            } else if (jarvisEvent.type === "log") {
              setLogs((prev) => [
                ...prev.slice(-99),
                { timestamp: new Date().toISOString(), message: jarvisEvent.data },
              ]);
            } else if (jarvisEvent.type === "error") {
              setLogs((prev) => [
                ...prev.slice(-99),
                { timestamp: new Date().toISOString(), message: `ERR: ${jarvisEvent.data}` },
              ]);
            }
          } else if (message.type === "project-update") {
            setCurrentProject(message.data.currentProject);
            setActiveTodos(message.data.activeTodos);
          }
        };

        ws.current.onclose = () => {
          console.log("WebSocket disconnected");
          setIsConnected(false);
          // Retry connection after 5 seconds
          reconnectTimeoutRef.current = setTimeout(connect, 5000);
        };

        ws.current.onerror = (error) => {
          console.error("WebSocket error:", error);
        };
      } catch (error) {
        console.error("Failed to create WebSocket:", error);
        // Retry connection after 5 seconds
        reconnectTimeoutRef.current = setTimeout(connect, 5000);
      }
    };

    connect();

    return () => {
      // Clear any pending reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      // Close WebSocket connection
      ws.current?.close();
    };
  }, [wsUrl]);

  const handleMicChange = (micIndex: number | null) => {
    setSelectedMic(micIndex);
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(
        JSON.stringify({
          type: "change-microphone",
          microphoneIndex: micIndex,
        })
      );
    }
    setShowMicSelector(false);
  };

  // Status Logic
  const isActive = status === "listening" || status === "recording";
  const isWake = status === "wake-word-detected" || wakeWordAnimation;
  const isProcessing = status === "processing";
  const hasError = status === "error";
  
  // Theme configuration (Neutral/Black/White)
  const theme = {
    bg: "#080808", // Deep black
    fg: "#Eaeaea", // Off-white
    dim: "#555555", // Grey
    accent: "#FFFFFF", // White for active states
    active: isWake ? "#FFFFFF" : isActive ? "#D0D0D0" : "#444444",
    border: "#222222"
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        position: "relative",
        background: theme.bg,
        color: theme.fg,
        fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
        overflow: "hidden",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Ambient Background */}
      <div 
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            radial-gradient(circle at 50% 50%, #151515 0%, transparent 70%)
          `,
          pointerEvents: "none",
        }} 
      />

      {/* Central Reactor/Eye */}
      <div style={{ position: "relative", width: "240px", height: "240px", display: "flex", justifyContent: "center", alignItems: "center" }}>
        {/* Outer Static Ring */}
        <div
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            border: `1px solid ${theme.dim}`,
            borderRadius: "50%",
            opacity: 0.3,
          }}
        />
        
        {/* Processing Ring (Rotates) */}
        <div
          style={{
            position: "absolute",
            width: "90%",
            height: "90%",
            border: `1px dashed ${isProcessing ? theme.accent : theme.dim}`,
            borderRadius: "50%",
            animation: isProcessing ? "spin 3s linear infinite" : "none",
            opacity: isProcessing ? 0.8 : 0.2,
            transition: "opacity 0.3s ease, border-color 0.3s ease",
          }}
        />

        {/* Core (Pulses) */}
        <div
          style={{
            width: isWake ? "40%" : isActive ? "35%" : "20%",
            height: isWake ? "40%" : isActive ? "35%" : "20%",
            background: hasError ? "#330000" : theme.active,
            borderRadius: "50%",
            boxShadow: isWake 
              ? `0 0 40px ${theme.accent}` 
              : isActive 
                ? `0 0 20px rgba(255,255,255,0.3)` 
                : "none",
            transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
            opacity: isWake ? 1 : isActive ? 0.9 : 0.6,
            border: hasError ? "2px solid red" : "none"
          }}
        />
        
        {/* Status Label */}
        <div
          style={{
            position: "absolute",
            bottom: "-40px",
            fontSize: "11px",
            letterSpacing: "3px",
            textTransform: "uppercase",
            color: theme.dim,
            fontWeight: 600
          }}
        >
          {status.replace(/-/g, " ")}
        </div>
      </div>

      {/* Center Overlay Conversation */}
      {(transcription || response) && (
        <div
          style={{
            position: "absolute",
            top: "15%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "600px",
            maxWidth: "90%",
            textAlign: "center",
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            gap: "24px"
          }}
        >
          {transcription && (
            <div style={{ animation: "fadeIn 0.5s ease" }}>
              <div style={{ fontSize: "10px", color: theme.dim, marginBottom: "6px", letterSpacing: "2px" }}>INPUT</div>
              <div style={{ fontSize: "18px", color: theme.fg, fontWeight: "300", lineHeight: "1.4" }}>"{transcription}"</div>
            </div>
          )}
          
          {response && (
            <div style={{ animation: "fadeIn 0.6s ease 0.2s backwards" }}>
              <div style={{ fontSize: "10px", color: theme.dim, marginBottom: "6px", letterSpacing: "2px" }}>OUTPUT</div>
              <div style={{ fontSize: "16px", color: theme.accent, lineHeight: "1.6", whiteSpace: "pre-wrap" }}>
                {response}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom Left: System & Logs */}
      <div
        style={{
          position: "absolute",
          bottom: "40px",
          left: "40px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          width: "300px",
        }}
      >
        {/* System Status */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
           <div style={{ fontSize: "9px", color: theme.dim, letterSpacing: "1px", textTransform: "uppercase" }}>SYSTEM STATUS</div>
           <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: theme.fg }}>
             <div style={{ width: "6px", height: "6px", background: isConnected ? theme.fg : theme.dim, borderRadius: "50%" }} />
             {isConnected ? "ONLINE" : "OFFLINE"} • CONF: {Math.round(confidence * 100)}%
           </div>
           <div 
             onClick={() => setShowMicSelector(!showMicSelector)}
             style={{ fontSize: "11px", color: theme.dim, cursor: "pointer", marginTop: "2px", display: "flex", alignItems: "center", gap: "4px" }}
           >
             MIC: {selectedMic !== null ? `idx:${selectedMic}` : "AUTO"} 
             <span style={{ fontSize: "8px" }}>▼</span>
           </div>
        </div>

        {/* Mini Log */}
        <div style={{  display: "flex", flexDirection: "column", gap: "4px", opacity: 0.6 }}>
           <div style={{ fontSize: "9px", color: theme.dim, letterSpacing: "1px", textTransform: "uppercase" }}>RECENT LOGS</div>
           <div style={{ fontSize: "10px", color: theme.dim, fontFamily: "monospace", display: "flex", flexDirection: "column", gap: "2px" }}>
             {logs.slice(-3).map((l, i) => (
               <div key={i} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                 <span style={{ color: "#333" }}>{l.timestamp.split('T')[1].split('.')[0]}</span> {l.message}
               </div>
             ))}
           </div>
        </div>
      </div>

      {/* Bottom Right: Project */}
      <div
        style={{
          position: "absolute",
          bottom: "40px",
          right: "40px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          width: "300px",
          alignItems: "flex-end",
          textAlign: "right"
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-end" }}>
           <div style={{ fontSize: "9px", color: theme.dim, letterSpacing: "1px", textTransform: "uppercase" }}>ACTIVE PROTOCOL</div>
           {currentProject ? (
             <>
               <div style={{ fontSize: "13px", color: theme.fg, fontWeight: 500 }}>{currentProject.toUpperCase()}</div>
               <div style={{ fontSize: "11px", color: theme.dim }}>{activeTodos.length} PENDING OBJECTIVES</div>
               {activeTodos.slice(0, 2).map((todo, i) => (
                 <div key={i} style={{ fontSize: "10px", color: theme.dim, marginTop: "2px", maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                   • {todo.text}
                 </div>
               ))}
             </>
           ) : (
             <div style={{ fontSize: "11px", color: theme.dim }}>NO ACTIVE PROTOCOL</div>
           )}
        </div>
      </div>

      {/* Mic Selector Modal */}
      {showMicSelector && (
        <div
           style={{
             position: "absolute",
             bottom: "100px",
             left: "40px",
             background: "#111",
             border: "1px solid #333",
             padding: "8px",
             borderRadius: "4px",
             zIndex: 50,
             width: "200px"
           }}
        >
          <div 
            onClick={() => handleMicChange(null)}
            style={{ padding: "6px", fontSize: "11px", color: selectedMic === null ? "#fff" : "#666", cursor: "pointer" }}
          >
            System Default {selectedMic === null && "✓"}
          </div>
          {microphones.map(mic => (
            <div 
              key={mic.index}
              onClick={() => handleMicChange(mic.index)}
              style={{ padding: "6px", fontSize: "11px", color: selectedMic === mic.index ? "#fff" : "#666", cursor: "pointer", borderTop: "1px solid #222" }}
            >
              {mic.name} {selectedMic === mic.index && "✓"}
            </div>
          ))}
        </div>
      )}

      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          ::selection {
            background: rgba(255, 255, 255, 0.2);
          }
        `}
      </style>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
