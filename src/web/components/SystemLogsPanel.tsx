import React from "react";
import { StatDisplay } from "./StatDisplay";

interface SystemStats {
  cpu: number;
  memory: number;
  uptime: number;
}

interface Theme {
  bg: string;
  fg: string;
  dim: string;
  accent: string;
  warn: string;
  success: string;
}

interface SystemLogsPanelProps {
  systemStats: SystemStats;
  logs: Array<{ timestamp: string; message: string }>;
  theme: Theme;
  formatUptime: (sec: number) => string;
}

export const SystemLogsPanel = ({ systemStats, logs, theme, formatUptime }: SystemLogsPanelProps) => {
  return (
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
  );
};
