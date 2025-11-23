import { useEffect, useState } from "react";
import type { Microphone } from "../list-microphones";
import { listMicrophones } from "../list-microphones";
import { JarvisEngine, type JarvisStatus, type JarvisEvent } from "../jarvis-engine";
import { useKeyboard, useTerminalDimensions, useRenderer } from "@opentui/react";
import { playAudioFile } from "../audio-utils";
import { SoundWave } from "./SoundWave";
import { memory } from "../memory";

// Minimal Black/Neutral Color Palette
const C_WHITE = "#FFFFFF";
const C_GRAY = "#888888";
const C_DIM = "#444444";
const C_BG = "#000000";
const C_ACCENT = "#AAAAAA";
const C_WARN = "#FF4444";
const C_SUCCESS = "#00FF00";

export function App() {
  const { width, height } = useTerminalDimensions();
  const renderer = useRenderer();
  const [microphones, setMicrophones] = useState<Microphone[]>([]);
  const [selectedMic, setSelectedMic] = useState<number | null>(null);
  const [status, setStatus] = useState<JarvisStatus>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [transcription, setTranscription] = useState<string>("");
  const [response, setResponse] = useState<string>("");
  const [lastConfidence, setLastConfidence] = useState<number>(0);
  const [projectUpdate, setProjectUpdate] = useState<number>(0);
  const [currentProject, setCurrentProject] = useState<string | null>(null);
  const [activeTodos, setActiveTodos] = useState<any[]>([]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [engine, setEngine] = useState<JarvisEngine | null>(null);
  const [showMicSelector, setShowMicSelector] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [wakeWordAnimation, setWakeWordAnimation] = useState(false);

  // Setup renderer
  useEffect(() => {
      renderer.console.clear(); // Start clean
  }, [renderer]);

  // Load microphones and auto-select MacBook Pro Microphone if available
  useEffect(() => {
    listMicrophones().then((mics) => {
      setMicrophones(mics);

      // Try to find MacBook Pro Microphone
      const macbookMic = mics.find(m => m.name.toLowerCase().includes("macbook pro microphone"));
      if (macbookMic) {
        setSelectedMic(macbookMic.index);
      }
    });
  }, []);

  // Initialize engine and auto-start
  useEffect(() => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      addLog("ERR: GROQ_KEY_MISSING");
      return;
    }

    const jarvis = new JarvisEngine({
      microphoneIndex: selectedMic,
      groqApiKey: apiKey,
    });

    jarvis.on("*", (event: JarvisEvent) => {
      if (event.type === "status") {
        setStatus(event.data);
      } else if (event.type === "wake-word") {
        const confidence = event.data.confidence;
        setLastConfidence(confidence);
        setWakeWordAnimation(true);

        // Play sound on wake word detection
        spawn("afplay", ["/System/Library/Sounds/Glass.aiff"]);

        setTimeout(() => setWakeWordAnimation(false), 1500);
        addLog(`WAKE DETECTED [${(confidence * 100).toFixed(0)}%]`);
      } else if (event.type === "transcription") {
        setTranscription(event.data);
        addLog(`You: ${event.data}`);
      } else if (event.type === "response") {
        setResponse(event.data);
        addLog(`Jarvis: ${event.data}`);
        // Update project data
        updateProjectData();
      } else if (event.type === "log") {
        addLog(event.data);
      } else if (event.type === "error") {
        addLog(`ERR: ${event.data}`);
      }
    });

    setEngine(jarvis);
    jarvis.start();

    return () => {
      jarvis.stop();
    };
  }, [selectedMic]);

  const addLog = (message: string) => {
    const time = new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    setLogs((prev) => [...prev.slice(-12), `[${time}] ${message}`]);
  };

  const updateProjectData = async () => {
    const project = await memory.getCurrentProject();
    const todos = await memory.getActiveTodos();
    setCurrentProject(project?.name || null);
    setActiveTodos(todos);
  };

  // Load project data on mount
  useEffect(() => {
    updateProjectData();
  }, []);

  useKeyboard((key) => {
    if (showMicSelector) {
      if (key.name === "up") {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (key.name === "down") {
        setSelectedIndex((prev) => Math.min(microphones.length, prev + 1));
      } else if (key.name === "return") {
        const newMic = selectedIndex === 0 ? null : microphones[selectedIndex - 1]?.index ?? null;
        setSelectedMic(newMic);
        addLog(`SYS: MIC RECONFIGURED`);
        setShowMicSelector(false);
        renderer.console.clear();
      } else if (key.name === "escape") {
        setShowMicSelector(false);
        renderer.console.clear();
      }
    } else {
      if (key.name === "m") {
        setShowMicSelector(true);
        setSelectedIndex(selectedMic === null ? 0 : microphones.findIndex((m) => m.index === selectedMic) + 1);
      } else if (key.name === "p" && transcription) {
        playAudioFile("command.wav");
        addLog("SYS: PLAYBACK");
      } else if (key.name === "c") {
        // Copy logs to clipboard
        const { spawn: nodeSpawn } = require("child_process");
        const logText = logs.join("\n");
        const pbcopy = nodeSpawn("pbcopy");
        pbcopy.stdin.write(logText);
        pbcopy.stdin.end();
        addLog("SYS: LOGS COPIED TO CLIPBOARD");
      } else if (key.name === "q" || (key.ctrl && key.name === "c")) {
        process.exit(0);
      }
    }
  });

  const mainColor = wakeWordAnimation ? C_WHITE : status === "error" ? C_WARN : status === "listening" ? C_WHITE : C_GRAY;

  if (showMicSelector) {
    return (
      <box style={{ width, height, backgroundColor: C_BG, flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <box style={{
            width: Math.min(60, width - 4),
            height: Math.min(microphones.length + 10, height - 4),
            border: true,
            borderStyle: "single",
            borderColor: C_GRAY,
            flexDirection: "column",
            padding: 1,
            gap: 1
        }}>
            <text fg={C_WHITE}>Select Microphone</text>

            <box style={{ flexDirection: "column", flexGrow: 1, gap: 0 }}>
                <box style={{ backgroundColor: selectedIndex === 0 ? C_DIM : "transparent", paddingLeft: 1, height: 1 }}>
                    <text fg={selectedMic === null ? C_SUCCESS : C_GRAY}>{selectedMic === null ? "● " : "  "}System Default</text>
                </box>
                {microphones.map((mic, idx) => (
                    <box key={mic.index} style={{ backgroundColor: selectedIndex === idx + 1 ? C_DIM : "transparent", paddingLeft: 1, height: 1 }}>
                        <text fg={selectedMic === mic.index ? C_SUCCESS : C_GRAY}>{selectedMic === mic.index ? "● " : "  "}{mic.name}</text>
                    </box>
                ))}
            </box>

            <box style={{ paddingTop: 1 }}>
                <text fg={C_DIM}>↑/↓ navigate · Enter confirm · ESC cancel</text>
            </box>
        </box>
      </box>
    );
  }

  return (
    <box style={{ width, height, backgroundColor: C_BG, flexDirection: "column", padding: 1, gap: 1 }}>
        {/* HEADER */}
        <box style={{ height: 3, flexDirection: "row", justifyContent: "space-between", border: true, borderStyle: "single", borderColor: C_DIM, paddingLeft: 2, paddingRight: 2, alignItems: "center" }}>
             <text fg={C_WHITE}>JARVIS</text>
             <text fg={C_DIM}>{status === "listening" ? "Listening" : status === "processing" ? "Processing" : status === "recording" ? "Recording" : "Idle"}</text>
        </box>

        {/* MAIN CONTENT */}
        <box style={{ flexGrow: 1, flexDirection: "row", gap: 1 }}>

            {/* LEFT: LOGS */}
            <box style={{ width: "40%", flexDirection: "column" }}>
                 <box title="Activity Log" style={{ border: true, borderColor: C_DIM, flexGrow: 1, padding: 1, flexDirection: "column" }}>
                     {logs.length === 0 ? (
                        <text fg={C_DIM}>Waiting for activity...</text>
                     ) : (
                        logs.map((l, i) => <text key={i} fg={C_GRAY}>{l}</text>)
                     )}
                 </box>
            </box>

            {/* CENTER: STATUS & VISUALIZER */}
            <box style={{ flexGrow: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", border: true, borderStyle: "single", borderColor: mainColor, gap: 2 }}>

                {!transcription && !response && (
                    <text fg={C_DIM}>Say "Jarvis" to activate</text>
                )}

                {transcription && (
                    <box style={{ padding: 1, maxWidth: "90%", flexDirection: "column" }}>
                        <text fg={C_GRAY}>You:</text>
                        <text fg={C_WHITE}>"{transcription}"</text>
                    </box>
                )}

                {response && (
                    <box style={{ padding: 1, maxWidth: "90%", marginTop: 1, flexDirection: "column" }}>
                        <text fg={C_GRAY}>Jarvis:</text>
                        {response.split('\n').map((line, i) => (
                            <text key={i} fg={C_SUCCESS}>{line}</text>
                        ))}
                    </box>
                )}

                <SoundWave active={status === "listening" || status === "recording"} color={mainColor} />

                {lastConfidence > 0 && (
                    <text fg={C_DIM}>Confidence: {(lastConfidence * 100).toFixed(0)}%</text>
                )}

            </box>

            {/* RIGHT: PROJECT & CONTROLS */}
            <box style={{ width: "30%", flexDirection: "column", gap: 1 }}>
                 <box title="Current Project" style={{ border: true, borderColor: C_ACCENT, padding: 1, flexDirection: "column", gap: 1 }}>
                     {currentProject ? (
                       <>
                         <text fg={C_WHITE}>{currentProject}</text>
                         <text fg={C_DIM}>Todos: {activeTodos.length}</text>
                         {activeTodos.slice(0, 3).map((todo, i) => (
                           <text key={todo.id} fg={C_GRAY}>• {todo.text.substring(0, 25)}{todo.text.length > 25 ? '...' : ''}</text>
                         ))}
                       </>
                     ) : (
                       <text fg={C_DIM}>No project</text>
                     )}
                 </box>

                 <box title="Microphone" style={{ border: true, borderColor: C_DIM, padding: 1, flexDirection: "column" }}>
                     <text fg={C_GRAY}>{selectedMic === null ? "Default" : (microphones.find(m => m.index === selectedMic)?.name.substring(0, 20) ?? "Unknown")}</text>
                 </box>

                 <box title="Controls" style={{ border: true, borderColor: C_DIM, flexGrow: 1, padding: 1, flexDirection: "column", gap: 1 }}>
                        <text fg={C_GRAY}>m - Change mic</text>
                        <text fg={C_GRAY}>p - Replay last</text>
                        <text fg={C_GRAY}>c - Copy logs</text>
                        <text fg={C_WARN}>q - Quit</text>
                 </box>
            </box>

        </box>
    </box>
  );
}

function spawn(command: string, args: string[]) {
  const { spawn: nodeSpawn } = require("child_process");
  nodeSpawn(command, args);
}
