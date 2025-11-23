import { useTimeline } from "@opentui/react";
import { useEffect, useState } from "react";

interface SoundWaveProps {
    active: boolean;
    color: string;
}

export function SoundWave({ active, color }: SoundWaveProps) {
    const [seed, setSeed] = useState(0);

    // Use timeline to update 'seed' rapidly to create jitter
    const timeline = useTimeline({
        duration: 1000,
        loop: true,
        autoplay: true
    });

    useEffect(() => {
        if (!active) return;
        
        timeline.add(
            { val: 0 },
            {
                val: 100,
                duration: 500, // rapid changes
                repeat: -1,
                yoyo: true,
                onUpdate: () => {
                    setSeed(Math.random());
                }
            }
        );
    }, [active]);

    // Generate simulated bars based on seed
    const barsCount = 40; // Wider
    const bars = Array.from({ length: barsCount }).map((_, i) => {
        if (!active) return 1;
        // Use seed to randomize
        return Math.max(1, Math.floor((seed + Math.sin(i)) * 4)) % 4 + 1; 
    });

    return (
        <box style={{ flexDirection: "row", alignItems: "flex-end", height: 5, gap: 0 }}>
            {bars.map((h, i) => (
                <box 
                    key={i}
                    style={{
                        width: 1,
                        height: h, 
                        backgroundColor: color,
                    }}
                />
            ))}
        </box>
    );
}
