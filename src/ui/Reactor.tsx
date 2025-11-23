import { useTimeline } from "@opentui/react";
import { useEffect, useState } from "react";

interface ReactorProps {
  status: "idle" | "listening" | "processing" | "error" | "wake-word-detected" | "recording";
}

export function Reactor({ status }: ReactorProps) {
  const [rotation, setRotation] = useState(0);
  const [pulse, setPulse] = useState(0);

  const timeline = useTimeline({
    duration: 2000,
    loop: true,
    autoplay: true,
  });

  useEffect(() => {
    timeline.add(
      { rotation: 0, pulse: 0 },
      {
        rotation: 360,
        pulse: 1,
        duration: 2000,
        ease: "linear",
        onUpdate: (anim) => {
          setRotation(anim.targets[0].rotation);
          setPulse(Math.abs(Math.sin(anim.targets[0].pulse * Math.PI)));
        },
      }
    );
  }, []);

  const getColor = () => {
    switch (status) {
      case "listening": return "#00d9ff";
      case "wake-word-detected": return "#ffd700";
      case "processing": return "#00ff88";
      case "error": return "#ff0000";
      case "recording": return "#ff3366";
      default: return "#0077ff";
    }
  };

  const color = getColor();
  const isActive = status === "listening" || status === "recording" || status === "processing";

  const getRingChar = (angle: number, ring: number) => {
    const normalized = (angle + rotation * (ring % 2 === 0 ? 1 : -1)) % 360;
    const chars = ["◢", "◣", "◤", "◥"];
    return chars[Math.floor(normalized / 90)];
  };

  const getPulseChar = () => {
    if (pulse > 0.75) return "◆";
    if (pulse > 0.5) return "◇";
    if (pulse > 0.25) return "◈";
    return "◇";
  };

  const intensity = isActive ? (pulse > 0.5 ? "█" : "▓") : "░";

  return (
    <box
      style={{
        border: true,
        borderColor: color,
        borderStyle: isActive ? "double" : "single",
        alignItems: "center",
        justifyContent: "center",
        padding: 2,
        minWidth: 40,
        minHeight: 18
      }}
    >
      <box style={{ flexDirection: "column", alignItems: "center", gap: 0 }}>

        {/* Outer Ring 1 */}
        <box style={{ flexDirection: "row", gap: 0 }}>
          <text fg={color}>{getRingChar(0, 3)}  {getRingChar(30, 3)}  {getRingChar(60, 3)}  {getRingChar(90, 3)}  {getRingChar(120, 3)}  {getRingChar(150, 3)}  {getRingChar(180, 3)}</text>
        </box>

        {/* Outer Ring 2 */}
        <box style={{ flexDirection: "row", gap: 1 }}>
          <text fg={color}>{getRingChar(330, 2)}</text>
          <text fg={color}>                   </text>
          <text fg={color}>{getRingChar(210, 2)}</text>
        </box>

        {/* Middle Ring 1 */}
        <box style={{ flexDirection: "row", gap: 1 }}>
          <text fg={color}>{getRingChar(315, 2)}</text>
          <text fg={color}>     {intensity} {intensity} {intensity} {intensity} {intensity}     </text>
          <text fg={color}>{getRingChar(225, 2)}</text>
        </box>

        {/* Middle Ring 2 */}
        <box style={{ flexDirection: "row", gap: 1 }}>
          <text fg={color}>{getRingChar(300, 1)}</text>
          <text fg={color}>   {intensity}           {intensity}   </text>
          <text fg={color}>{getRingChar(240, 1)}</text>
        </box>

        {/* Inner Ring + Core */}
        <box style={{ flexDirection: "row", gap: 1 }}>
          <text fg={color}>{getRingChar(285, 1)}</text>
          <text fg={color}>  {intensity}</text>
          <box
            style={{
              border: true,
              borderColor: color,
              width: 9,
              height: 5,
              borderStyle: isActive ? "double" : "single",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: isActive && pulse > 0.7 ? "#111111" : "transparent"
            }}
          >
            <box style={{ flexDirection: "column", alignItems: "center" }}>
              <text fg={color}>{intensity}{intensity}{intensity}</text>
              <text fg={color}><strong>{getPulseChar()}</strong></text>
              <text fg={color}>{intensity}{intensity}{intensity}</text>
            </box>
          </box>
          <text fg={color}>{intensity}  </text>
          <text fg={color}>{getRingChar(255, 1)}</text>
        </box>

        {/* Middle Ring 3 */}
        <box style={{ flexDirection: "row", gap: 1 }}>
          <text fg={color}>{getRingChar(270, 1)}</text>
          <text fg={color}>   {intensity}           {intensity}   </text>
          <text fg={color}>{getRingChar(270, 1)}</text>
        </box>

        {/* Middle Ring 4 */}
        <box style={{ flexDirection: "row", gap: 1 }}>
          <text fg={color}>{getRingChar(255, 2)}</text>
          <text fg={color}>     {intensity} {intensity} {intensity} {intensity} {intensity}     </text>
          <text fg={color}>{getRingChar(285, 2)}</text>
        </box>

        {/* Outer Ring 3 */}
        <box style={{ flexDirection: "row", gap: 1 }}>
          <text fg={color}>{getRingChar(240, 2)}</text>
          <text fg={color}>                   </text>
          <text fg={color}>{getRingChar(300, 2)}</text>
        </box>

        {/* Outer Ring 4 */}
        <box style={{ flexDirection: "row", gap: 0 }}>
          <text fg={color}>{getRingChar(180, 3)}  {getRingChar(210, 3)}  {getRingChar(240, 3)}  {getRingChar(270, 3)}  {getRingChar(300, 3)}  {getRingChar(330, 3)}  {getRingChar(0, 3)}</text>
        </box>

        {/* Status */}
        <box style={{ marginTop: 1 }}>
          <text fg={color}><strong>{status.toUpperCase()}</strong></text>
        </box>

        {/* Energy Bars */}
        {isActive && (
          <box style={{ marginTop: 1, flexDirection: "row", gap: 1 }}>
            <text fg={color}>{pulse > 0.8 ? "█" : "▓"}</text>
            <text fg={color}>{pulse > 0.6 ? "█" : "▓"}</text>
            <text fg={color}>{pulse > 0.4 ? "█" : "▓"}</text>
            <text fg={color}>{pulse > 0.2 ? "█" : "▓"}</text>
            <text fg={color}>{"█"}</text>
            <text fg={color}>{pulse > 0.2 ? "█" : "▓"}</text>
            <text fg={color}>{pulse > 0.4 ? "█" : "▓"}</text>
            <text fg={color}>{pulse > 0.6 ? "█" : "▓"}</text>
            <text fg={color}>{pulse > 0.8 ? "█" : "▓"}</text>
          </box>
        )}
      </box>
    </box>
  );
}
