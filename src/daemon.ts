import type { ServerWebSocket } from "bun";
import { JarvisEngine, type JarvisEvent, type JarvisStatus } from "./jarvis-engine";
import type { ServerMessage, ClientMessage, JarvisState } from "./types/websocket";
import { memory } from "./memory";
import { reminders } from "./memory/reminders";
import { TextToSpeech } from "./tts";
import { listMicrophones } from "./list-microphones";
import { killExistingInstances } from "./utils/kill-existing";
import { spawn, type ChildProcess } from "child_process";
import { join } from "path";

// Kill any existing instances before starting
console.log("🔍 Checking for existing instances...");
killExistingInstances(7777);

// Store connected clients
const clients = new Set<ServerWebSocket<{ id: string }>>();

// Jarvis state
let jarvisState: JarvisState = {
  status: "idle",
  logs: [],
  transcription: "",
  response: "",
  confidence: 0,
  currentProject: null,
  activeTodos: [],
};

// Initialize Jarvis Engine
const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
  console.error("ERROR: GROQ_API_KEY environment variable is required");
  process.exit(1);
}

// Load preferred microphone from memory
const preferredMic = await memory.getPreferredMicrophone();
const initialMicIndex = preferredMic.index;
if (preferredMic.name) {
  console.log(`🎤 Using preferred microphone: ${preferredMic.name} (index: ${initialMicIndex})`);
} else {
  console.log(`🎤 Using default microphone`);
}

const jarvis = new JarvisEngine({
  microphoneIndex: initialMicIndex,
  groqApiKey: apiKey,
});

// Initialize TTS for reminder announcements (use same British voice as Jarvis)
const tts = new TextToSpeech(apiKey, 'Basil-PlayAI');

// Vibration sound management
let vibrationSoundProcess: ChildProcess | null = null;
const vibrationSoundPath = join(process.cwd(), "vibration.wav");

function startVibrationSound() {
  // Stop any existing vibration sound
  stopVibrationSound();
  
  // Start playing vibration sound in a loop with louder volume (0.6 = 60% volume)
  // Using a shell loop since afplay doesn't support looping directly
  vibrationSoundProcess = spawn("sh", [
    "-c",
    `while true; do afplay -v 0.6 "${vibrationSoundPath}" 2>/dev/null || break; done`
  ]);
  
  vibrationSoundProcess.on("error", (error) => {
    console.error("Failed to start vibration sound:", error);
    vibrationSoundProcess = null;
  });
}

function stopVibrationSound() {
  if (vibrationSoundProcess) {
    vibrationSoundProcess.kill();
    vibrationSoundProcess = null;
  }
}

// Helper to broadcast to all clients
function broadcast(message: ServerMessage) {
  const json = JSON.stringify(message);
  for (const client of clients) {
    client.send(json);
  }
}

// Helper to add log
function addLog(message: string) {
  const timestamp = new Date().toISOString();
  jarvisState.logs.push({ timestamp, message });
  // Keep only last 100 logs
  if (jarvisState.logs.length > 100) {
    jarvisState.logs = jarvisState.logs.slice(-100);
  }
}

// Update project data
async function updateProjectData() {
  const project = await memory.getCurrentProject();
  const todos = await memory.getActiveTodos();
  jarvisState.currentProject = project?.name || null;
  jarvisState.activeTodos = todos;

  // Broadcast updated todos to all clients
  broadcast({
    type: "project-update",
    data: {
      currentProject: jarvisState.currentProject,
      activeTodos: jarvisState.activeTodos
    }
  });
}

// Setup Jarvis event handlers
jarvis.on("*", async (event: JarvisEvent) => {
  // Update state based on event
  if (event.type === "status") {
    const newStatus = event.data;
    const oldStatus = jarvisState.status;
    jarvisState.status = newStatus;
    
    // Manage vibration sound based on status - only play when recording (after wake word)
    if (newStatus === "recording" && oldStatus !== "recording") {
      // Started recording - play vibration sound
      startVibrationSound();
    } else if (newStatus !== "recording" && oldStatus === "recording") {
      // Stopped recording - stop vibration sound
      stopVibrationSound();
    }
  } else if (event.type === "wake-word") {
    const confidence = event.data.confidence;
    jarvisState.confidence = confidence;
    addLog(`WAKE DETECTED [${(confidence * 100).toFixed(0)}%]`);
  } else if (event.type === "transcription") {
    jarvisState.transcription = event.data;
    addLog(`You: ${event.data}`);
  } else if (event.type === "response") {
    jarvisState.response = event.data;
    addLog(`Jarvis: ${event.data}`);
    await updateProjectData();
  } else if (event.type === "log") {
    addLog(event.data);
  } else if (event.type === "error") {
    addLog(`ERR: ${event.data}`);
  }

  // Broadcast event to all connected clients
  broadcast({
    type: "jarvis-event",
    event,
  });
});

// Start Jarvis
console.log("Starting Jarvis engine...");
await jarvis.start();
await updateProjectData();
console.log("Jarvis engine started");

// Start vibration sound if Jarvis is already recording (unlikely on startup, but just in case)
if (jarvisState.status === "recording") {
  startVibrationSound();
}

// Bundle the frontend
console.log("Building frontend...");
const buildResult = await Bun.build({
  entrypoints: ["./src/web/app.tsx"],
  outdir: "./dist",
  naming: "[name].js",
  target: "browser",
});

if (!buildResult.success) {
  console.error("Build failed:", buildResult.logs);
  process.exit(1);
}
console.log("Frontend built successfully");

// Start Bun server with WebSocket support
const server = Bun.serve({
  port: 7777,
  async fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req, {
        data: { id: crypto.randomUUID() },
      });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // API routes
    if (url.pathname === "/api/state") {
      return Response.json(jarvisState);
    }

    if (url.pathname === "/api/microphones") {
      const mics = await listMicrophones();
      return Response.json(mics);
    }

    // Serve bundled JS
    if (url.pathname === "/app.js") {
      return new Response(Bun.file("dist/app.js"), {
        headers: { "Content-Type": "application/javascript" },
      });
    }

    // Serve index.html for root
    if (url.pathname === "/") {
      return new Response(Bun.file("src/web/index.html"), {
        headers: { "Content-Type": "text/html" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
  websocket: {
    open(ws) {
      clients.add(ws);
      console.log(`Client connected. Total clients: ${clients.size}`);

      // Send initial connection message
      ws.send(
        JSON.stringify({
          type: "connected",
          data: { timestamp: new Date().toISOString() },
        } satisfies ServerMessage)
      );

      // Send current state
      ws.send(
        JSON.stringify({
          type: "jarvis-event",
          event: { type: "status", data: jarvisState.status },
        } satisfies ServerMessage)
      );
    },

    async message(ws, message) {
      try {
        const data = JSON.parse(message.toString()) as ClientMessage;

        if (data.type === "ping") {
          // Respond to ping
          ws.send(JSON.stringify({ type: "connected", data: { timestamp: new Date().toISOString() } }));
        } else if (data.type === "change-microphone") {
          await jarvis.updateMicrophone(data.microphoneIndex);
          
          // Save to memory as preferred microphone
          if (data.microphoneIndex !== null) {
            const mics = await listMicrophones();
            const mic = mics.find(m => m.index === data.microphoneIndex);
            if (mic) {
              await memory.setPreferredMicrophone(mic.index, mic.name);
              addLog(`Microphone changed to ${mic.name} (index: ${mic.index})`);
            } else {
              await memory.setPreferredMicrophone(data.microphoneIndex, null);
              addLog(`Microphone changed to index ${data.microphoneIndex}`);
            }
          } else {
            await memory.setPreferredMicrophone(null, null);
            addLog(`Microphone changed to default`);
          }
          
          broadcast({
            type: "jarvis-event",
            event: { type: "log", data: `Microphone updated` },
          });
        }
      } catch (error) {
        console.error("Error parsing client message:", error);
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Invalid message format",
          } satisfies ServerMessage)
        );
      }
    },

    close(ws) {
      clients.delete(ws);
      console.log(`Client disconnected. Total clients: ${clients.size}`);
    },
  },
  development: {
    hmr: true,
  },
});

console.log(`🚀 Jarvis Daemon running at http://localhost:${server.port}`);
console.log(`📡 WebSocket server ready for connections`);
console.log(`🎤 Listening for wake word...`);

// Reminder checker - runs every 5 seconds
// Use global to track interval across module reloads (for --watch mode)
declare global {
  var __jarvisReminderInterval: ReturnType<typeof setInterval> | undefined;
}

async function checkReminders() {
  try {
    const now = new Date();
    // Get fresh reminders from file
    const dueReminders = await reminders.getDue();
    const allReminders = await reminders.getAll();
    
    // Debug logging
    if (allReminders.length > 0) {
      const localTime = now.toLocaleString();
      const localTimeISO = now.toISOString();
      console.log(`[Reminder Check] Current local time: ${localTime} (UTC: ${localTimeISO})`);
      console.log(`[Reminder Check] Found ${allReminders.length} total reminders, ${dueReminders.length} due`);
      allReminders.forEach((r: any) => {
        const scheduled = new Date(r.scheduledTime);
        const scheduledLocal = scheduled.toLocaleString();
        const isPast = scheduled <= now;
        const isDue = !r.completed && isPast;
        const timeUntil = scheduled.getTime() - now.getTime();
        const minutesUntil = Math.floor(timeUntil / 60000);
        console.log(`[Reminder Check] - "${r.text}" scheduled: ${scheduledLocal} (${r.scheduledTime}), completed: ${r.completed}, isPast: ${isPast}, isDue: ${isDue}, ${minutesUntil} minutes until due`);
      });
    }
    
    for (const reminder of dueReminders) {
      // Announce reminder via TTS
      const announcement = `Reminder, Sir. ${reminder.text}`;
      console.log(`🔔 Reminder: ${reminder.text}`);
      addLog(`🔔 Reminder: ${reminder.text}`);
      
      try {
        await tts.speak(announcement);
        // Delete reminder after announcing
        await reminders.delete(reminder.id);
        console.log(`✅ Reminder deleted: ${reminder.text}`);
      } catch (error: any) {
        console.error(`Failed to announce reminder: ${error.message}`);
        addLog(`ERR: Failed to announce reminder: ${reminder.text}`);
      }
      
      // Broadcast reminder event to clients
      broadcast({
        type: "jarvis-event",
        event: { 
          type: "log", 
          data: `🔔 Reminder: ${reminder.text}` 
        },
      });
    }
  } catch (error: any) {
    console.error(`Error checking reminders: ${error.message}`);
  }
}

// Clear any existing interval (important for --watch mode)
if (globalThis.__jarvisReminderInterval) {
  clearInterval(globalThis.__jarvisReminderInterval);
  console.log(`⏰ Cleared existing reminder checker interval`);
}

// Start reminder checker (check every 5 seconds)
globalThis.__jarvisReminderInterval = setInterval(checkReminders, 5 * 1000);
console.log(`⏰ Reminder checker started (checking every 5 seconds)`);

// Check immediately on startup
checkReminders();

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  if (globalThis.__jarvisReminderInterval) {
    clearInterval(globalThis.__jarvisReminderInterval);
  }
  stopVibrationSound();
  jarvis.stop();
  server.stop();
  process.exit(0);
});
