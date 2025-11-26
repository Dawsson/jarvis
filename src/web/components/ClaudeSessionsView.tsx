import React, { useState, useEffect, useRef } from "react";
import type { ClaudeSessionUpdate, ScreenView } from "../../types/websocket";
import type { SessionMessage } from "../../claude-agent/types";
import { DiffViewer } from "./DiffViewer";

// Local types for this component
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

// Helper function to format file paths
const formatFilePath = (fullPath: string, maxLength: number = 60): string => {
  // Remove common prefixes like /Users/username/projects/
  let path = fullPath.replace(/^\/Users\/[^/]+\/projects\//, '/');

  // If still too long, truncate from the middle
  if (path.length > maxLength) {
    const start = path.substring(0, 20);
    const end = path.substring(path.length - (maxLength - 23));
    path = `${start}...${end}`;
  }

  return path;
};

export const ClaudeSessionsView = ({
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
      fetch(`/api/claude-sessions/${selectedSession}/code-review`)
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
            // CLOUD CODE SESSIONS
          </div>
        </div>

        <button
            onClick={onBack}
            style={{
              background: "rgba(20, 20, 20, 0.6)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              color: "#888",
              padding: "10px 20px",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "11px",
              fontWeight: "600",
              letterSpacing: "1.5px",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              borderRadius: "2px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backdropFilter: "blur(10px)",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(30, 30, 30, 0.8)";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.15)";
              e.currentTarget.style.color = "#aaa";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(20, 20, 20, 0.6)";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
              e.currentTarget.style.color = "#888";
            }}
        >
            <span>❮</span> BACK TO HOME
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
               <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", alignItems: "center" }}>
                 <span style={{ fontSize: "11px", fontWeight: "bold", color: theme.accent, letterSpacing: "1px" }}>
                    {s["repositoryName"] || "UNKNOWN REPO"}
                 </span>
                 <span style={{ fontSize: "9px", fontWeight: "bold", padding: "2px 6px", background: "rgba(255,255,255,0.05)", borderRadius: "2px", color: getStatusColor(s.status) }}>
                    {s.status.toUpperCase()}
                 </span>
               </div>
               
               <div style={{ fontSize: "12px", lineHeight: "1.4", color: "#eee", marginBottom: "8px", fontWeight: selectedSession === s.sessionId ? "bold" : "normal" }}>
                  {s.task.length > 70 ? s.task.substring(0, 70) + "..." : s.task}
               </div>
               
               <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "10px", color: "#666" }}>
                 <span>{s.filesCreated.length + s.filesModified.length} files modified</span>
                 {s.prUrl && (
                    <span style={{ color: theme.success, display: "flex", alignItems: "center", gap: "4px" }}>
                        PR Linked
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
                   height: "40px",
                   padding: "0 20px", 
                   borderBottom: `1px solid ${theme.dim}`, 
                   background: "#111", 
                   display: "flex", alignItems: "center", justifyContent: "space-between",
                   flexShrink: 0 // Prevent shrinking
               }}>
                  <div style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: "13px", fontWeight: "bold", color: "#fff" }}>
                      {selectedSessionData.task}
                  </div>
                  
                  <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                      <div style={{ fontSize: "11px", color: theme.dim, fontFamily: "monospace" }}>ID: {selectedSessionData.sessionId.substring(0,8)}</div>
                      
                      {selectedSessionData.prUrl && (
                          <a href={selectedSessionData.prUrl} target="_blank" rel="noopener noreferrer"
                             style={{ 
                                 color: theme.accent, fontSize: "11px", fontWeight: "bold", textDecoration: "none",
                                 display: "flex", alignItems: "center", gap: "4px"
                             }}>
                             OPEN PR ↗
                          </a>
                      )}
                  </div>
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
                       <div style={{ flex: 1, minWidth: 0 }}>
                           <div style={{ fontSize: "12px", color: "#ccc" }}>{op.path.split('/').pop()}</div>
                           <div style={{ fontSize: "10px", color: "#555", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{formatFilePath(op.path, 50)}</div>
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
