import { useTimeline } from "@opentui/react";
import { useEffect, useState } from "react";

interface ReactorProps {
  status: "idle" | "listening" | "processing" | "error" | "wake-word-detected" | "recording";
}

export function Reactor({ status }: ReactorProps) {
  const [rotation, setRotation] = useState(0);

  const timeline = useTimeline({
    duration: 3000,
    loop: true,
    autoplay: true,
  });

  useEffect(() => {
    // Rotation animation
    timeline.add(
      { rotation: 0 },
      {
        rotation: 360,
        duration: 3000,
        ease: "linear",
        onUpdate: (anim) => {
          setRotation(anim.targets[0].rotation);
        },
      }
    );
  }, []);

  // Determine color based on status
  const getColor = () => {
    switch (status) {
      case "listening": return "#00d9ff"; // Bright Cyan
      case "wake-word-detected": return "#ffd700"; // Gold
      case "processing": return "#00ff88"; // Green
      case "error": return "#ff0000"; // Red
      case "recording": return "#ff3366"; // Pinkish
      default: return "#0077ff"; // Dim Blue
    }
  };

  const color = getColor();
  const isActive = status === "listening" || status === "recording" || status === "processing";

  // ASCII Art generation for 'Arc Reactor' feel
  const getRingChar = (angle: number) => {
    const normalized = (angle + rotation) % 360;
    if (normalized < 90) return "◢";
    if (normalized < 180) return "◣";
    if (normalized < 270) return "◤";
    return "◥";
  };
  
  const centerChar = status === "processing" ? "⚙" : status === "listening" ? "●" : "○";

  return (
    <box 
      style={{ 
        border: true, 
        borderColor: color, 
        borderStyle: isActive ? "double" : "rounded",
        alignItems: "center", 
        justifyContent: "center",
        padding: 1,
        minWidth: 20,
        minHeight: 7
      }}
    >
      <box style={{ flexDirection: "column", alignItems: "center", gap: 0 }}>
        {/* Visual Ring Construction */}
        <box style={{ flexDirection: "row", gap: 1 }}>
           <text fg={color}>{getRingChar(0)}</text>
           <text fg={color}>{getRingChar(45)}</text>
           <text fg={color}>{getRingChar(90)}</text>
        </box>
        
        <box style={{ flexDirection: "row", gap: 2, margin: 1 }}>
           <text fg={color}>{getRingChar(315)}</text>
           <box 
             style={{ 
                border: true, 
                borderColor: color, 
                width: 5, 
                height: 3,
                borderStyle: "single",
                alignItems: "center", 
                justifyContent: "center" 
             }}
           >
              {isActive ? (
                  <text fg={color}><strong>{centerChar}</strong></text>
              ) : (
                  <text fg={color}>{centerChar}</text>
              )}
           </box>
           <text fg={color}>{getRingChar(135)}</text>
        </box>

        <box style={{ flexDirection: "row", gap: 1 }}>
           <text fg={color}>{getRingChar(270)}</text>
           <text fg={color}>{getRingChar(225)}</text>
           <text fg={color}>{getRingChar(180)}</text>
        </box>
        
        <box style={{ marginTop: 1 }}>
            <text fg={color}>{status.toUpperCase()}</text>
        </box>
      </box>
    </box>
  );
}
