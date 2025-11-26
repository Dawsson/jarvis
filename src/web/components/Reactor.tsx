import React from "react";
import type { JarvisStatus } from "../../jarvis-engine";

interface ReactorProps {
  status: JarvisStatus;
  confidence: number;
}

export const Reactor = ({ status, confidence }: ReactorProps) => {
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
