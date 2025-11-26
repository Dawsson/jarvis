import React from "react";
import type { ScreenView, ClaudeSessionUpdate } from "../../types/websocket";

interface Theme {
  bg: string;
  fg: string;
  dim: string;
  accent: string;
  warn: string;
  success: string;
}

interface HeaderProps {
  isConnected: boolean;
  theme: Theme;
  claudeSessions: ClaudeSessionUpdate[];
  time: Date;
  selectedMic: number | null;
  onViewChange: (view: ScreenView) => void;
  onToggleMicSelector: () => void;
}

export const Header = ({
  isConnected,
  theme,
  claudeSessions,
  time,
  selectedMic,
  onViewChange,
  onToggleMicSelector
}: HeaderProps) => {
  return (
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
        {claudeSessions.length > 0 && (
          <button
            onClick={() => onViewChange("claude-sessions")}
            style={{
              marginTop: "16px",
              background: claudeSessions.some(s => s.status === 'active')
                ? "rgba(0, 217, 255, 0.08)"
                : "rgba(20, 20, 20, 0.6)",
              border: claudeSessions.some(s => s.status === 'active')
                ? `1px solid ${theme.accent}`
                : "1px solid rgba(255, 255, 255, 0.08)",
              color: claudeSessions.some(s => s.status === 'active') ? theme.accent : "#888",
              padding: "10px 18px",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "10px",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              fontWeight: "600",
              borderRadius: "2px",
              backdropFilter: "blur(10px)",
              boxShadow: claudeSessions.some(s => s.status === 'active')
                ? `0 0 20px rgba(0, 217, 255, 0.15)`
                : "0 2px 8px rgba(0, 0, 0, 0.3)"
            }}
            onMouseEnter={(e) => {
              if (claudeSessions.some(s => s.status === 'active')) {
                e.currentTarget.style.background = "rgba(0, 217, 255, 0.12)";
                e.currentTarget.style.boxShadow = "0 0 25px rgba(0, 217, 255, 0.25)";
              } else {
                e.currentTarget.style.background = "rgba(30, 30, 30, 0.8)";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.15)";
                e.currentTarget.style.color = "#aaa";
              }
            }}
            onMouseLeave={(e) => {
              if (claudeSessions.some(s => s.status === 'active')) {
                e.currentTarget.style.background = "rgba(0, 217, 255, 0.08)";
                e.currentTarget.style.boxShadow = "0 0 20px rgba(0, 217, 255, 0.15)";
              } else {
                e.currentTarget.style.background = "rgba(20, 20, 20, 0.6)";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
                e.currentTarget.style.color = "#888";
              }
            }}
          >
            {claudeSessions.some(s => s.status === 'active')
              ? `⚡ ${claudeSessions.filter(s => s.status === 'active').length} Active Operations`
              : "◈ Access Archives"}
          </button>
        )}
      </div>

      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: "24px", color: "#fff", letterSpacing: "2px" }}>
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div onClick={onToggleMicSelector} style={{ fontSize: "11px", color: theme.dim, letterSpacing: "1px", cursor: "pointer", marginTop: "4px" }}>
          AUDIO INPUT: {selectedMic !== null ? `IDX ${selectedMic}` : "AUTO"} ▼
        </div>
      </div>
    </div>
  );
};
