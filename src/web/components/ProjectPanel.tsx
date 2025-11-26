import React from "react";

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

interface Theme {
  bg: string;
  fg: string;
  dim: string;
  accent: string;
  warn: string;
  success: string;
}

interface ProjectPanelProps {
  currentProject: string | null;
  activeTodos: Todo[];
  reminders: Reminder[];
  theme: Theme;
}

export const ProjectPanel = ({ currentProject, activeTodos, reminders, theme }: ProjectPanelProps) => {
  return (
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
  );
};
