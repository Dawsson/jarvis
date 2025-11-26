import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { ServerMessage, JarvisState, ScreenView, CodeSessionUpdate } from "../types/websocket";
import type { JarvisStatus } from "../jarvis-engine";
import type { SessionMessage } from "../claude-agent/types";
import { diffLines, type Change } from "diff";

// --- Types ---
// Redefined locally for safety and self-containment
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

interface FileOperation {
  path: string;
  operation: 'read' | 'write' | 'edit';
  timestamp: string;
  toolUseId: string;
  oldContent?: string;
  newContent?: string;
  linesAdded?: number;
  linesRemoved?: number;
}

interface CodeReviewSummary {
  totalFiles: number;
  filesCreated: number;
  filesModified: number;
  filesRead: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  fileOperations: FileOperation[];
}

// --- Components ---

// 1. Large Complex Reactor (Arc Style) - Preserved
const Reactor = ({ status, confidence }: { status: JarvisStatus, confidence: number }) => {
  const isIdle = status === "idle";
  const isHighEnergy = status === "processing" || status === "recording" || status === "wake-word-detected";
  const baseColor = "#444";
  const activeColor = "#00d9ff"; 
  const recordColor = "#ff4444";
  const wakeColor = "#fff";
  const listeningColor = "#888"; 

  const primaryColor = status === "recording" ? recordColor 
    : status === "wake-word-detected" ? wakeColor
    : status === "listening" ? listeningColor
    : isIdle ? baseColor 
    : activeColor;

  return (
    <div style={{ position: "relative", width: 450, height: 450, display: "flex", justifyContent: "center", alignItems: "center" }}>
      <div style={{
        position: "absolute", width: "120px", height: "120px", borderRadius: "50%",
        background: primaryColor, opacity: isHighEnergy ? 0.4 : 0.05, filter: "blur(30px)",
        transition: "all 0.5s ease",
        animation: isHighEnergy ? "pulse 2s ease-in-out infinite" : "none"
      }} />
      <svg width="100%" height="100%" style={{ position: "absolute", opacity: 0.8, transition: "all 0.3s ease" }}>
          <circle cx="225" cy="225" r="70" fill="none" stroke={primaryColor} strokeWidth="4" opacity={isHighEnergy ? 0.9 : 0.2} />
          <circle cx="225" cy="225" r="60" fill="none" stroke={primaryColor} strokeWidth="1" opacity={0.5} />
      </svg>
      <svg width="100%" height="100%" style={{ position: "absolute", animation: isHighEnergy ? "spin 4s linear infinite" : "none" }}>
         <circle cx="225" cy="225" r="90" fill="none" stroke={primaryColor} strokeWidth="8" strokeDasharray="20 40" opacity={isHighEnergy ? 0.6 : 0.1} />
      </svg>
      <svg width="100%" height="100%" style={{ position: "absolute", animation: isHighEnergy ? "spin 10s linear infinite reverse" : "none" }}>
         <circle cx="225" cy="225" r="120" fill="none" stroke={primaryColor} strokeWidth="1" opacity={0.3} />
         <path d="M225 95 L230 105 L220 105 Z" fill={primaryColor} />
         <path d="M225 355 L230 345 L220 345 Z" fill={primaryColor} />
         <path d="M95 225 L105 230 L105 220 Z" fill={primaryColor} />
         <path d="M355 225 L345 230 L345 220 Z" fill={primaryColor} />
      </svg>
      <svg width="100%" height="100%" style={{ position: "absolute", animation: isHighEnergy ? "spin 30s linear infinite" : "none" }}>
         <circle cx="225" cy="225" r="160" fill="none" stroke={primaryColor} strokeWidth="20" strokeDasharray="2 10" opacity={isHighEnergy ? 0.15 : 0.05} />
         <circle cx="225" cy="225" r="180" fill="none" stroke={primaryColor} strokeWidth="1" strokeDasharray="40 40" opacity={0.2} />
      </svg>
      <svg width="100%" height="100%" style={{ position: "absolute" }}>
         {Array.from({ length: 60 }).map((_, i) => (
           <line key={i} x1="225" y1="20" x2="225" y2={i % 5 === 0 ? "40" : "30"} stroke={primaryColor} strokeWidth={i % 5 === 0 ? 2 : 1} transform={`rotate(${i * 6} 225 225)`} opacity={isHighEnergy ? (i % 5 === 0 ? 0.5 : 0.2) : 0.1} />
        ))}
      </svg>
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

// 2. Stat Display
const StatDisplay = ({ label, value, unit = "" }: { label: string, value: string | number, unit?: string }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
    <div style={{ fontSize: "9px", color: "#666", letterSpacing: "1px" }}>{label}</div>
    <div style={{ fontSize: "12px", color: "#aaa", fontFamily: "monospace" }}>{value}{unit}</div>
  </div>
);

// 3. Diff Viewer with Line Numbers
const DiffViewer = ({ fileOp, theme }: { fileOp: FileOperation, theme: any }) => {
  const [changes, setChanges] = useState<Change[]>([]);

  useEffect(() => {
    if (fileOp.oldContent || fileOp.newContent) {
      const diff = diffLines(fileOp.oldContent || "", fileOp.newContent || "");
      setChanges(diff);
    }
  }, [fileOp]);

  if (!fileOp.oldContent && !fileOp.newContent) return null;

  let oldLineNumber = 1;
  let newLineNumber = 1;

  return (
    <div style={{ background: "#151515", borderRadius: "4px", overflow: "hidden", fontFamily: "monospace", fontSize: "12px", border: `1px solid ${theme.dim}`, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "8px 12px", background: "#202020", borderBottom: `1px solid ${theme.dim}`, display: "flex", justifyContent: "space-between", color: "#ccc", alignItems: "center" }}>
        <span style={{ fontWeight: "bold", color: theme.accent }}>{fileOp.path.split('/').pop()}</span>
        <span style={{ fontSize: "10px", opacity: 0.5 }}>{fileOp.path}</span>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "0" }}>
         <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
               <col style={{ width: "40px" }} />
               <col style={{ width: "40px" }} />
               <col style={{ width: "20px" }} />
               <col style={{ width: "auto" }} />
            </colgroup>
            <tbody>
               {changes.map((part, i) => {
                  const color = part.added ? theme.success : part.removed ? theme.warn : "#888";
                  const bg = part.added ? "rgba(0, 255, 136, 0.1)" : part.removed ? "rgba(255, 68, 68, 0.1)" : "transparent";
                  const lines = part.value.replace(/\n$/, '').split('\n');

                  return lines.map((line, lineIndex) => {
                     const showOld = !part.added;
                     const showNew = !part.removed;
                     const oNum = showOld ? oldLineNumber++ : "";
                     const nNum = showNew ? newLineNumber++ : "";
                     const symbol = part.added ? "+" : part.removed ? "-" : " ";

                     return (
                        <tr key={`${i}-${lineIndex}`} style={{ backgroundColor: bg }}>
                           <td style={{ textAlign: "right", paddingRight: "8px", color: "#555", userSelect: "none", borderRight: "1px solid #333" }}>{oNum}</td>
                           <td style={{ textAlign: "right", paddingRight: "8px", color: "#555", userSelect: "none", borderRight: "1px solid #333" }}>{nNum}</td>
                           <td style={{ textAlign: "center", color: color, userSelect: "none" }}>{symbol}</td>
                           <td style={{ paddingLeft: "8px", color: color, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{line}</td>
                        </tr>
                     );
                  });
               })}
            </tbody>
         </table>
      </div>
    </div>
  );
};

// 4. Code Sessions View Component
const CodeSessionsView = ({
  sessions,
  sessionMessages,
  focusedSessionId,
  onBack,
  theme
}: {
  sessions: CodeSessionUpdate[];
  sessionMessages: Map<string, SessionMessage[]>;
  focusedSessionId?: string;
  onBack: () => void;
  theme: { bg: string; fg: string; dim: string; accent: string; warn: string; success: string };
}) => {
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [codeReview, setCodeReview] = useState<CodeReviewSummary | null>(null);
  const [selectedFileOp, setSelectedFileOp] = useState<FileOperation | null>(null);
  const [isFilePanelVisible, setIsFilePanelVisible] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [sessionMessages, selectedSession]);

  // Auto-select most recent session
  useEffect(() => {
    if (sessions.length > 0) {
      // If we have a focused ID from arguments (e.g. voice command), use it, otherwise find standard latest
      if (focusedSessionId && sessions.some(s => s.sessionId === focusedSessionId)) {
          if (selectedSession !== focusedSessionId) setSelectedSession(focusedSessionId);
      } else if (!selectedSession) {
           // Find session with most recent message or just top of list
           // Assuming sessions list might be updated order.
           // We'll just pick the first one if no selection.
           setSelectedSession(sessions[0].sessionId);
      }
    }
  }, [sessions, focusedSessionId]);

  // Fetch Code Review
  useEffect(() => {
    if (selectedSession) {
      setCodeReview(null); // Reset while loading
      setSelectedFileOp(null);
      fetch(`/api/code-sessions/${selectedSession}/code-review`)
        .then(res => res.json())
        .then(data => {
          if (data.codeReview) {
            setCodeReview(data.codeReview);
            // Auto select first modified file
            const firstOp = data.codeReview.fileOperations.find((op: FileOperation) => op.operation !== 'read');
            if (firstOp) setSelectedFileOp(firstOp);
          }
        })
        .catch(err => console.error("Failed to fetch code review", err));
    }
  }, [selectedSession]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return theme.accent;
      case "completed": return theme.success;
      case "error": return theme.warn;
      default: return theme.dim;
    }
  };

  const formatMessageContent = (msg: SessionMessage): React.ReactNode => {
    try {
      const content = msg.content as any;
      if (typeof content === 'string') return content;

      // Assistant Messages
      if (content.type === 'assistant') {
        if (content.message?.content) {
          return (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {content.message.content.map((c: any, i: number) => {
                     if (c.type === 'text') return <div key={i} style={{ whiteSpace: "pre-wrap" }}>{c.text}</div>;
                     if (c.type === 'tool_use') return (
                        <div key={i} style={{ 
                            border: `1px solid ${theme.accent}`, 
                            background: "rgba(0, 217, 255, 0.05)", 
                            padding: "8px", borderRadius: "4px", fontSize: "12px",
                            color: theme.accent
                        }}>
                           <div style={{ fontWeight: "bold", marginBottom: "4px" }}>🔧 Tool Use: {c.name}</div>
                           <div style={{ opacity: 0.7, maxHeight: "100px", overflow: "hidden", textOverflow: "ellipsis" }}>
                               {JSON.stringify(c.input)}
                           </div>
                        </div>
                     );
                     return null;
                  })}
              </div>
          );
        }
      }
      // User Messages
      if (content.type === 'user') {
         if (content.message?.content) {
            return content.message.content.map((c: any, i: number) => (
               c.type === 'text' ? <div key={i}>{c.text}</div> : null
            ));
         }
      }
      // Tool Results (Collapse large output)
      if (content.type === 'result') {
         const str = JSON.stringify(content);
         const isLarge = str.length > 300;
         return (
            <div style={{ 
                fontSize: "11px", fontFamily: "monospace", color: "#aaa", 
                background: "#111", padding: "8px", borderRadius: "4px",
                borderLeft: `2px solid ${theme.success}`
            }}>
               <div style={{ fontWeight: "bold", color: theme.success, marginBottom: "4px" }}>✅ Tool Result</div>
               <div style={{ opacity: 0.8 }}>
                   {isLarge ? str.substring(0, 300) + "..." : str}
               </div>
            </div>
         );
      }
      
      return JSON.stringify(content).substring(0, 200);
    } catch {
      return 'Message content';
    }
  };

  const selectedSessionData = sessions.find(s => s.sessionId === selectedSession);
  const selectedMessages = selectedSession ? sessionMessages.get(selectedSession) || [] : [];

  return (
    <div style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      background: "#0d0d0d", color: theme.fg, fontFamily: "'Share Tech Mono', monospace",
      backgroundImage: "linear-gradient(rgba(13, 13, 13, 0.95), rgba(13, 13, 13, 0.95)), url('data:image/svg+xml;charset=utf-8,%3Csvg width=\\'40\\' height=\\'40\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Cpath d=\\'M0 0h40v40H0z\\' fill=\\'none\\'/%3E%3Cpath d=\\'M0 40h40V0H0v40zM2 2h36v36H2V2z\\' fill=\\'%2300d9ff\\' fill-opacity=\\'0.03\\'/%3E%3C/svg%3E')"
    }}>
      {/* Header */}
      <div style={{
        height: "60px",
        padding: "0 24px",
        borderBottom: `1px solid ${theme.dim}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "rgba(0,0,0,0.8)",
        backdropFilter: "blur(10px)",
        zIndex: 20
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
          <div style={{ fontSize: "20px", fontWeight: "bold", letterSpacing: "4px", color: "#fff", textShadow: `0 0 10px ${theme.accent}` }}>
            JARVIS
          </div>
          <div style={{ fontSize: "12px", color: theme.accent, letterSpacing: "2px", opacity: 0.8 }}>
            // CODE SESSIONS
          </div>
        </div>
        
        <button onClick={onBack} style={{
            background: "rgba(0, 217, 255, 0.1)", 
            border: `1px solid ${theme.accent}`,
            color: theme.accent, 
            padding: "8px 24px", 
            cursor: "pointer",
            fontFamily: "inherit", fontSize: "12px", fontWeight: "bold", letterSpacing: "2px",
            transition: "all 0.2s",
            borderRadius: "2px",
            display: "flex", alignItems: "center", gap: "8px"
        }}>
            <span>❮</span> BACK TO HUB
        </button>
      </div>

      {/* Content Grid */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>

        {/* Left Panel: Session List */}
        <div style={{
          width: "320px", borderRight: `1px solid ${theme.dim}`, overflowY: "auto",
          background: "rgba(5,5,5,0.6)", display: "flex", flexDirection: "column"
        }}>
           <div style={{ padding: "16px", borderBottom: `1px solid ${theme.dim}`, fontSize: "11px", letterSpacing: "2px", color: "#666" }}>
              ACTIVE PROTOCOLS ({sessions.length})
           </div>
           
           {sessions.length === 0 && <div style={{ padding: 20, color: theme.dim, textAlign: "center", marginTop: "40px" }}>NO ACTIVE SESSIONS</div>}
           
           {sessions.map(s => (
             <div key={s.sessionId}
               onClick={() => setSelectedSession(s.sessionId)}
               style={{
                 padding: "16px", 
                 borderBottom: `1px solid #1a1a1a`,
                 background: selectedSession === s.sessionId ? "rgba(0, 217, 255, 0.08)" : "transparent",
                 borderLeft: selectedSession === s.sessionId ? `3px solid ${theme.accent}` : "3px solid transparent",
                 cursor: "pointer",
                 transition: "background 0.1s"
               }}
             >
               <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", alignItems: "center" }}>
                 <span style={{ color: getStatusColor(s.status), fontSize: "9px", fontWeight: "bold", padding: "2px 6px", background: "rgba(255,255,255,0.05)", borderRadius: "2px" }}>
                    {s.status.toUpperCase()}
                 </span>
                 <span style={{ color: "#555", fontSize: "10px", fontFamily: "monospace" }}>{s.sessionId.slice(0,6)}</span>
               </div>
               <div style={{ fontSize: "12px", lineHeight: "1.4", color: "#eee", marginBottom: "8px", fontWeight: selectedSession === s.sessionId ? "bold" : "normal" }}>
                  {s.task.length > 60 ? s.task.substring(0, 60) + "..." : s.task}
               </div>
               <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "10px", color: "#888" }}>
                 <span>📝 {s.filesCreated.length + s.filesModified.length} files</span>
                 {s.prUrl && (
                    <span style={{ color: theme.success, display: "flex", alignItems: "center", gap: "4px" }}>
                        🔗 PR Linked
                    </span>
                 )}
               </div>
             </div>
           ))}
        </div>

        {/* Middle Panel: Chat */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>
          {selectedSessionData ? (
             <>
               <div style={{ 
                   padding: "16px 24px", borderBottom: `1px solid ${theme.dim}`, 
                   background: "rgba(20,20,20,0.95)", display: "flex", justifyContent: "space-between", alignItems: "start"
               }}>
                  <div style={{ maxWidth: "70%" }}>
                      <div style={{ fontSize: "14px", color: "#fff", marginBottom: "6px", lineHeight: "1.4" }}>{selectedSessionData.task}</div>
                      <div style={{ fontSize: "11px", color: theme.dim }}>SESSION ID: {selectedSessionData.sessionId}</div>
                  </div>
                  {selectedSessionData.prUrl && (
                      <a href={selectedSessionData.prUrl} target="_blank" rel="noopener noreferrer"
                         style={{ 
                             color: theme.bg, background: theme.success, padding: "6px 12px", 
                             borderRadius: "2px", fontSize: "11px", fontWeight: "bold", textDecoration: "none",
                             display: "flex", alignItems: "center", gap: "6px"
                         }}>
                         OPEN PULL REQUEST ↗
                      </a>
                  )}
               </div>

               <div style={{ flex: 1, overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
                  {selectedMessages.map((msg, i) => (
                    <div key={i} style={{
                      alignSelf: msg.type === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: "85%",
                      position: "relative"
                    }}>
                       <div style={{ 
                           fontSize: "10px", color: "#666", marginBottom: "4px", 
                           textAlign: msg.type === 'user' ? "right" : "left",
                           padding: "0 4px"
                       }}>
                          {msg.type === 'assistant' ? 'JARVIS' : 'YOU'} • {new Date(msg.timestamp).toLocaleTimeString()}
                       </div>
                       <div style={{
                           background: msg.type === 'assistant' ? "#1a1a1a" : "rgba(0, 217, 255, 0.1)",
                           border: `1px solid ${msg.type === 'assistant' ? '#333' : theme.accent}`,
                           borderRadius: "6px",
                           padding: "16px",
                           fontSize: "13px",
                           lineHeight: "1.6",
                           boxShadow: "0 2px 10px rgba(0,0,0,0.2)"
                       }}>
                          {formatMessageContent(msg)}
                       </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
               </div>
             </>
          ) : (
             <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#333" }}>
                <div style={{ textAlign: "center" }}>
                   <div style={{ fontSize: "40px", marginBottom: "20px", opacity: 0.3 }}>◈</div>
                   <div>SELECT A MISSION PROTOCOL</div>
                </div>
             </div>
          )}
        </div>

        {/* Right Panel: Files & Diffs */}
        <div style={{ 
            width: isFilePanelVisible ? "550px" : "40px", 
            borderLeft: `1px solid ${theme.dim}`, 
            background: "rgba(0,0,0,0.6)", 
            display: "flex", 
            flexDirection: "column",
            transition: "width 0.3s ease"
        }}>
            <div style={{ 
                height: "40px", borderBottom: `1px solid ${theme.dim}`, 
                background: "#111", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "0 10px"
            }}>
                {isFilePanelVisible && <span style={{ fontSize: "11px", fontWeight: "bold", letterSpacing: "1px", color: "#888" }}>SYSTEM MODIFICATIONS</span>}
                <button onClick={() => setIsFilePanelVisible(!isFilePanelVisible)} style={{ 
                    background: "transparent", border: "none", color: "#888", cursor: "pointer", fontSize: "14px" 
                }}>
                    {isFilePanelVisible ? "▶" : "◀"}
                </button>
            </div>

           {isFilePanelVisible && codeReview ? (
             <>
               {/* Stats Row */}
               <div style={{ padding: "16px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", borderBottom: `1px solid ${theme.dim}` }}>
                  <div style={{ background: "rgba(0,255,136,0.05)", border: "1px solid rgba(0,255,136,0.2)", padding: "10px", textAlign: "center", borderRadius: "4px" }}>
                     <div style={{ fontSize: "18px", color: theme.success, fontWeight: "bold" }}>+{codeReview.totalLinesAdded}</div>
                     <div style={{ fontSize: "8px", color: "#888", marginTop: "2px" }}>ADDED</div>
                  </div>
                  <div style={{ background: "rgba(255,68,68,0.05)", border: "1px solid rgba(255,68,68,0.2)", padding: "10px", textAlign: "center", borderRadius: "4px" }}>
                     <div style={{ fontSize: "18px", color: theme.warn, fontWeight: "bold" }}>-{codeReview.totalLinesRemoved}</div>
                     <div style={{ fontSize: "8px", color: "#888", marginTop: "2px" }}>REMOVED</div>
                  </div>
                  <div style={{ background: "#1a1a1a", border: "1px solid #333", padding: "10px", textAlign: "center", borderRadius: "4px" }}>
                     <div style={{ fontSize: "18px", color: "#fff", fontWeight: "bold" }}>{codeReview.totalFiles}</div>
                     <div style={{ fontSize: "8px", color: "#888", marginTop: "2px" }}>FILES</div>
                  </div>
               </div>

               {/* File List */}
               <div style={{ height: "200px", overflowY: "auto", borderBottom: `1px solid ${theme.dim}`, padding: "4px" }}>
                 {codeReview.fileOperations.map((op, i) => (
                   op.operation !== 'read' && (
                     <div key={i}
                       onClick={() => setSelectedFileOp(op)}
                       style={{
                         padding: "8px 12px", cursor: "pointer",
                         background: selectedFileOp === op ? "#1a1a1a" : "transparent",
                         borderLeft: selectedFileOp === op ? `2px solid ${theme.accent}` : "2px solid transparent",
                         marginBottom: "2px", borderRadius: "0 4px 4px 0",
                         display: "flex", alignItems: "center", justifyContent: "space-between"
                       }}
                     >
                       <div>
                           <div style={{ fontSize: "12px", color: "#ccc" }}>{op.path.split('/').pop()}</div>
                           <div style={{ fontSize: "10px", color: "#555" }}>{op.path}</div>
                       </div>
                       <div style={{ fontSize: "10px", display: "flex", gap: "8px", opacity: 0.7 }}>
                          {op.linesAdded ? <span style={{ color: theme.success }}>+{op.linesAdded}</span> : null}
                          {op.linesRemoved ? <span style={{ color: theme.warn }}>-{op.linesRemoved}</span> : null}
                       </div>
                     </div>
                   )
                 ))}
               </div>
               
               {/* Diff View */}
               <div style={{ flex: 1, overflow: "hidden", background: "#000", position: "relative" }}>
                  {selectedFileOp ? (
                     <DiffViewer fileOp={selectedFileOp} theme={theme} />
                  ) : (
                     <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#333", fontSize: "12px" }}>
                        SELECT A FILE TO EXAMINE
                     </div>
                  )}
               </div>
             </>
           ) : isFilePanelVisible && (
             <div style={{ padding: "40px", color: "#444", textAlign: "center", fontSize: "12px" }}>
                {selectedSession ? "Loading system analysis..." : ""}
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

  const theme = {
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
          <CodeSessionsView
            sessions={codeSessions}
            sessionMessages={sessionMessages}
            focusedSessionId={focusedSessionId}
            onBack={() => handleViewChange("home")}
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

      {/* Top Header */}
      <div style={{
          position: "absolute", top: 40, left: 40, right: 40,
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          zIndex: 10
      }}>
         <div>
            <div style={{ fontSize: "32px", fontWeight: "bold", letterSpacing: "8px", color: "#fff", marginBottom: "4px" }}>JARVIS</div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", letterSpacing: "2px", color: isConnected ? theme.success : theme.warn }}>
               <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: isConnected ? theme.success : theme.warn }} />
               {isConnected ? "SYSTEM ONLINE" : "OFFLINE"}
            </div>
            {codeSessions.length > 0 && (
              <button
                onClick={() => handleViewChange("code-sessions")}
                style={{
                  marginTop: "16px",
                  background: "rgba(0, 217, 255, 0.05)",
                  border: `1px solid ${codeSessions.some(s => s.status === 'active') ? theme.accent : theme.dim}`,
                  color: codeSessions.some(s => s.status === 'active') ? theme.accent : theme.fg,
                  padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", fontSize: "10px", letterSpacing: "1px",
                  textTransform: "uppercase",
                  transition: "all 0.2s",
                  fontWeight: "bold"
                }}
              >
                {codeSessions.some(s => s.status === 'active') ? `⚡ ${codeSessions.filter(s => s.status === 'active').length} Active Operations` : "📦 Access Archives"}
              </button>
            )}
         </div>

         <div style={{ textAlign: "right" }}>
             <div style={{ fontSize: "24px", color: "#fff", letterSpacing: "2px" }}>
                {time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
             </div>
             <div onClick={() => setShowMicSelector(!showMicSelector)} style={{ fontSize: "11px", color: theme.dim, letterSpacing: "1px", cursor: "pointer", marginTop: "4px" }}>
                AUDIO INPUT: {selectedMic !== null ? `IDX ${selectedMic}` : "AUTO"} ▼
             </div>
         </div>
      </div>

      {/* Center: Reactor & Conversation */}
      <div style={{ position: "relative", zIndex: 5, display: "flex", flexDirection: "column", alignItems: "center", gap: "40px" }}>
         <Reactor status={status} confidence={confidence} />
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

      {/* Bottom Left: Logs & Stats */}
      <div style={{ position: "absolute", bottom: 40, left: 40, width: "350px", display: "flex", flexDirection: "column", gap: "20px", zIndex: 10 }}>
          <div style={{ display: "flex", gap: "20px", borderBottom: "1px solid #222", paddingBottom: "10px" }}>
             <StatDisplay label="CPU" value={(systemStats.cpu * 100).toFixed(0)} unit="%" />
             <StatDisplay label="RAM" value={systemStats.memory.toFixed(0)} unit="%" />
             <StatDisplay label="UPTIME" value={formatUptime(systemStats.uptime)} />
          </div>
          <div>
             <div style={{ fontSize: "10px", color: theme.dim, letterSpacing: "2px", marginBottom: "8px" }}>SYSTEM LOGS</div>
             <div style={{ height: "150px", overflowY: "hidden", display: "flex", flexDirection: "column", justifyContent: "flex-end", fontSize: "11px", fontFamily: "monospace", color: "#888" }}>
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
      <div style={{ position: "absolute", bottom: 40, right: 40, width: "300px", display: "flex", flexDirection: "column", gap: "24px", zIndex: 10, textAlign: "right", alignItems: "flex-end" }}>
          <div>
              <div style={{ fontSize: "10px", color: theme.dim, letterSpacing: "2px", marginBottom: "4px" }}>ACTIVE PROTOCOL</div>
              <div style={{ fontSize: "16px", color: "#fff", fontWeight: "bold" }}>{currentProject || "IDLE"}</div>
          </div>
          <div>
             <div style={{ fontSize: "10px", color: theme.dim, letterSpacing: "2px", marginBottom: "6px" }}>PENDING OBJECTIVES</div>
             <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end" }}>
                 {activeTodos.length === 0 ? <div style={{ fontSize: "11px", color: "#444" }}>-- No active tasks --</div> : null}
                 {activeTodos.slice(0, 5).map(todo => (
                     <div key={todo.id} style={{ fontSize: "12px", color: "#ccc" }}>{todo.text}</div>
                 ))}
             </div>
          </div>
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

      {showMicSelector && (
        <div style={{ position: "absolute", top: "80px", right: "40px", width: "220px", background: "#111", border: "1px solid #333", padding: "5px", zIndex: 50 }}>
            <div onClick={() => handleMicChange(null)} style={{ padding: "8px", fontSize: "11px", color: selectedMic === null ? "#fff" : "#888", cursor: "pointer" }}>System Default</div>
            {microphones.map(mic => (
                <div key={mic.index} onClick={() => handleMicChange(mic.index)} style={{ padding: "8px", fontSize: "11px", color: selectedMic === mic.index ? "#fff" : "#888", cursor: "pointer", borderTop: "1px solid #222" }}>{mic.name}</div>
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
