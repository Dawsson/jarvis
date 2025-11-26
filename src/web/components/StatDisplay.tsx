import React from "react";

interface StatDisplayProps {
  label: string;
  value: string | number;
  unit?: string;
}

export const StatDisplay = ({ label, value, unit = "" }: StatDisplayProps) => (
  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
    <div style={{ fontSize: "9px", color: "#666", letterSpacing: "1px" }}>{label}</div>
    <div style={{ fontSize: "12px", color: "#aaa", fontFamily: "monospace" }}>{value}{unit}</div>
  </div>
);
