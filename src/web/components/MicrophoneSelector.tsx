import React from "react";

interface MicrophoneSelectorProps {
  show: boolean;
  microphones: Array<{ index: number; name: string }>;
  selectedMic: number | null;
  onMicChange: (micIndex: number | null) => void;
}

export function MicrophoneSelector({ show, microphones, selectedMic, onMicChange }: MicrophoneSelectorProps) {
  if (!show) return null;

  return (
    <div style={{ position: "absolute", top: "80px", right: "40px", width: "220px", background: "#111", border: "1px solid #333", padding: "5px", zIndex: 50 }}>
      <div onClick={() => onMicChange(null)} style={{ padding: "8px", fontSize: "11px", color: selectedMic === null ? "#fff" : "#888", cursor: "pointer" }}>System Default</div>
      {microphones.map(mic => (
        <div key={mic.index} onClick={() => onMicChange(mic.index)} style={{ padding: "8px", fontSize: "11px", color: selectedMic === mic.index ? "#fff" : "#888", cursor: "pointer", borderTop: "1px solid #222" }}>{mic.name}</div>
      ))}
    </div>
  );
}
