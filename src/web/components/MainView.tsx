import React from "react";
import { Reactor } from "./Reactor";
import type { JarvisStatus } from "../../jarvis-engine";

interface MainViewProps {
  status: JarvisStatus;
  confidence: number;
  transcription: string;
  response: string;
}

export function MainView({ status, confidence, transcription, response }: MainViewProps) {
  return (
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
  );
}
