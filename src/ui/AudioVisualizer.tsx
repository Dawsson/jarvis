interface AudioVisualizerProps {
  level: number;
  width?: number;
}

export function AudioVisualizer({ level, width = 50 }: AudioVisualizerProps) {
  const bars = 20;
  const barWidth = Math.floor(width / bars);
  const filledBars = Math.floor((level / 100) * bars);

  return (
    <box style={{ flexDirection: "row", gap: 0, width }}>
      {Array.from({ length: bars }).map((_, i) => {
        const isFilled = i < filledBars;
        const color = isFilled
          ? level > 80
            ? "#ef4444"
            : level > 50
            ? "#fbbf24"
            : "#4ade80"
          : "#374151";

        return (
          <box
            key={i}
            style={{
              width: barWidth,
              height: 1,
              backgroundColor: color,
            }}
          />
        );
      })}
    </box>
  );
}
