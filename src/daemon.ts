import type { ServerWebSocket } from "bun";
import { JarvisEngine, type JarvisEvent, type JarvisStatus } from "./jarvis-engine";
import type { ServerMessage, ClientMessage, JarvisState, ScreenView, CodeSessionUpdate } from "./types/websocket";
import { memory } from "./memory";
import { reminders } from "./memory/reminders";
import { TextToSpeech } from "./tts";
import { listMicrophones } from "./list-microphones";
import { killExistingInstances } from "./utils/kill-existing";
import { setScreenControlCallback } from "./tools/screen-control";
import { claudeAgentManager } from "./claude-agent/manager";
import { spawn, type ChildProcess } from "child_process";
import { join } from "path";
import * as os from "os";
import * as readline from "readline";

// Kill any existing instances before starting
console.log("🔍 Checking for existing instances...");
killExistingInstances(7777);

// Kill any orphaned vibration sound processes from previous crashes
console.log("🔊 Cleaning up any orphaned vibration sounds...");
try {
  spawn("pkill", ["-f", "afplay.*vibration.wav"]);
} catch (error) {
  // Ignore errors if pkill fails
}

// Ask user for activation mode
console.log("\n🎯 Choose activation mode:");
console.log("  1. Voice only (say 'Jarvis')");
console.log("  2. Keyboard only (Right Option key)");
console.log("  3. Both (voice + keyboard)");
console.log("");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const activationMode = await new Promise<"voice" | "keyboard" | "both">((resolve) => {
  rl.question("Enter choice (1, 2, or 3): ", (answer) => {
    rl.close();
    const choice = answer.trim();
    if (choice === "2") {
      resolve("keyboard");
    } else if (choice === "3") {
      resolve("both");
    } else {
      resolve("voice");
    }
  });
});

const modeDescription =
  activationMode === "voice" ? "voice only (wake word)" :
  activationMode === "keyboard" ? "keyboard only (Right Option)" :
  "both voice and keyboard";

console.log(`\n✅ Using ${modeDescription} activation\n`);

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
  reminders: [],
  currentView: "home",
};

// Screen control function - called by the showOnScreen tool
function changeScreenView(view: ScreenView, sessionId?: string) {
  jarvisState.currentView = view;

  // Broadcast screen control message to all clients
  broadcast({
    type: "screen-control",
    data: { view, sessionId },
  });

  addLog(`Screen view changed to: ${view}${sessionId ? ` (session: ${sessionId})` : ''}`);

  // If switching to code-sessions view, also send the current sessions
  if (view === "code-sessions" || view === "split") {
    broadcastCodeSessions();
  }
}

// Set up the screen control callback for the tool
setScreenControlCallback(changeScreenView);

// Broadcast current code sessions to all clients
async function broadcastCodeSessions() {
  const sessions = await claudeAgentManager.listSessions(false); // Get all sessions

  const sessionUpdates: CodeSessionUpdate[] = sessions.map(s => ({
    sessionId: s.session_id,
    status: s.status,
    task: s.task,
    latestMessage: s.messages.length > 0 ? {
      type: s.messages[s.messages.length - 1].type,
      content: JSON.stringify(s.messages[s.messages.length - 1].content).substring(0, 500),
      timestamp: s.messages[s.messages.length - 1].timestamp,
    } : undefined,
    filesModified: s.files_modified,
    filesCreated: s.files_created,
    prUrl: s.jarvis_metadata.pr_url,
    repositoryName: s.repository_name,
  }));

  broadcast({
    type: "code-sessions-update",
    data: { sessions: sessionUpdates },
  });
}

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
  useWakeWord: activationMode === "voice" || activationMode === "both", // Enable wake word for voice and both modes
});

// Initialize TTS for reminder announcements (use same British voice as Jarvis)
const tts = new TextToSpeech(apiKey, 'Basil-PlayAI');

// Keyboard listener process (only in keyboard mode)
let keyboardListener: ChildProcess | null = null;

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
    // Kill the process
    vibrationSoundProcess.kill('SIGKILL');
    vibrationSoundProcess = null;
  }

  // Also kill any orphaned afplay processes playing the vibration sound
  // This ensures cleanup even if the parent shell process was killed abruptly
  try {
    spawn("pkill", ["-f", `afplay.*${vibrationSoundPath}`]);
  } catch (error) {
    // Ignore errors if pkill fails (e.g., no matching processes)
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

// Update reminders data
async function updateRemindersData() {
  const activeReminders = await reminders.getActive();
  jarvisState.reminders = activeReminders;

  // Broadcast updated reminders to all clients
  broadcast({
    type: "reminders-update",
    data: {
      reminders: jarvisState.reminders
    }
  });
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
await updateRemindersData();
console.log("Jarvis engine started");

// Initialize Claude Agent Manager and subscribe to session events
await claudeAgentManager.init();
claudeAgentManager.onSessionEvent((event) => {
  console.log(`📦 Claude session event: ${event.type} for session ${event.sessionId}`);

  // If we're in code-sessions or split view, broadcast updates
  if (jarvisState.currentView === "code-sessions" || jarvisState.currentView === "split") {
    if (event.message) {
      // Broadcast individual message
      broadcast({
        type: "code-session-message",
        data: {
          sessionId: event.sessionId,
          message: event.message,
        },
      });
    }

    // Also broadcast the full session update
    broadcastClaudeSessions();
  }

  // Log session events
  if (event.type === 'session-created') {
    addLog(`🚀 Claude session created: ${event.session?.task}`);
  } else if (event.type === 'session-completed') {
    addLog(`✅ Claude session completed: ${event.session?.task}`);
  } else if (event.type === 'session-error') {
    addLog(`❌ Claude session error: ${event.session?.error_message}`);
  }
});
console.log("Claude Agent Manager initialized");

// Start keyboard listener if in keyboard or both modes
if (activationMode === "keyboard" || activationMode === "both") {
  console.log("Starting keyboard listener...");
  keyboardListener = spawn("uvx", ["--with", "pynput", "python3", "scripts/keyboard_listener.py"]);

  keyboardListener.stdout.on("data", async (data: Buffer) => {
    const message = data.toString().trim();

    if (message === "READY") {
      console.log("⌨️  Keyboard listener ready");
      console.log("   • Press Right Option once: Start recording");
      console.log("   • Press Right Option again: Stop and process");
    } else if (message === "TOGGLE_ON") {
      // Start recording
      addLog("Right Option pressed - recording started");
      jarvis.manualActivate();
    } else if (message === "TOGGLE_OFF") {
      // Stop recording and process
      addLog("Right Option pressed - recording stopped, processing...");
      jarvis.manualDeactivate();
    }
  });

  keyboardListener.stderr.on("data", (data: Buffer) => {
    const msg = data.toString();
    console.error("Keyboard listener error:", msg);
  });

  keyboardListener.on("error", (error) => {
    console.error("Failed to start keyboard listener:", error);
  });
}

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

    if (url.pathname === "/api/code-sessions") {
      const sessions = await claudeAgentManager.listSessions(false);
      const sessionUpdates: CodeSessionUpdate[] = sessions.map(s => ({
        sessionId: s.session_id,
        status: s.status,
        task: s.task,
        latestMessage: s.messages.length > 0 ? {
          type: s.messages[s.messages.length - 1].type,
          content: JSON.stringify(s.messages[s.messages.length - 1].content).substring(0, 500),
          timestamp: s.messages[s.messages.length - 1].timestamp,
        } : undefined,
        filesModified: s.files_modified,
        filesCreated: s.files_created,
        prUrl: s.jarvis_metadata.pr_url,
        repositoryName: s.repository_name,
      }));
      return Response.json(sessionUpdates);
    }

    // Get detailed code review for a specific session
    if (url.pathname.startsWith("/api/code-sessions/") && url.pathname.endsWith("/code-review")) {
      const sessionId = url.pathname.split("/")[3];
      const session = await claudeAgentManager.getSession(sessionId);

      if (!session) {
        return Response.json({ error: "Session not found" }, { status: 404 });
      }

      return Response.json({
        sessionId: session.session_id,
        task: session.task,
        status: session.status,
        codeReview: session.code_review || {
          totalFiles: 0,
          filesCreated: 0,
          filesModified: 0,
          filesRead: 0,
          totalLinesAdded: 0,
          totalLinesRemoved: 0,
          fileOperations: [],
        },
        prUrl: session.jarvis_metadata.pr_url,
      });
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

      // Send current view
      ws.send(
        JSON.stringify({
          type: "screen-control",
          data: { view: jarvisState.currentView || "home" },
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
        } else if (data.type === "request-code-sessions") {
          // Client is requesting current code sessions
          broadcastCodeSessions();
        } else if (data.type === "set-view") {
          // Client is manually changing the view
          changeScreenView(data.view);
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

// Show appropriate message based on activation mode
if (activationMode === "voice") {
  console.log(`🎤 Listening for wake word...`);
} else if (activationMode === "keyboard") {
  console.log(`⌨️  Ready for keyboard activation (Right Option key)`);
} else {
  console.log(`🎤 Listening for wake word or keyboard activation...`);
}

// Setup text input interface for typing to Jarvis
console.log(`💬 Type your message and press Enter to talk to Jarvis\n`);

const textInputInterface = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '> ',
});

textInputInterface.prompt();

textInputInterface.on('line', async (line: string) => {
  const input = line.trim();

  if (input.length === 0) {
    textInputInterface.prompt();
    return;
  }

  // Process the text input through Jarvis
  try {
    await jarvis.processTextInput(input);
  } catch (error: any) {
    console.error('❌ Error processing text input:', error.message);
  }

  textInputInterface.prompt();
});

textInputInterface.on('close', () => {
  console.log('\n👋 Goodbye!');
  process.exit(0);
});

// System stats checker - runs every 2 seconds
// Use global to track interval across module reloads
declare global {
  var __jarvisStatsInterval: ReturnType<typeof setInterval> | undefined;
}

function broadcastStats() {
  const cpuLoad = os.loadavg()[0]; // 1 minute load average
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsage = (usedMem / totalMem) * 100;
  const uptime = os.uptime();

  broadcast({
    type: "system-stats",
    data: {
      cpu: cpuLoad,
      memory: memUsage,
      uptime: uptime
    }
  });
}

if (globalThis.__jarvisStatsInterval) {
  clearInterval(globalThis.__jarvisStatsInterval);
}
globalThis.__jarvisStatsInterval = setInterval(broadcastStats, 2000);
console.log("📊 System stats monitor started");

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
    
    // Update reminders state for UI
    await updateRemindersData();

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
  if (globalThis.__jarvisStatsInterval) {
    clearInterval(globalThis.__jarvisStatsInterval);
  }
  stopVibrationSound();
  if (keyboardListener) {
    keyboardListener.kill();
  }
  jarvis.stop();
  server.stop();
  process.exit(0);
});
