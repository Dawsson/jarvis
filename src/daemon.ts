import type { ServerWebSocket } from "bun";
import { JarvisEngine, type JarvisEvent, type JarvisStatus } from "./jarvis-engine";
import type { ServerMessage, ClientMessage, JarvisState } from "./types/websocket";
import { memory } from "./memory";
import { listMicrophones } from "./list-microphones";

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

const jarvis = new JarvisEngine({
  microphoneIndex: null, // Use default microphone
  groqApiKey: apiKey,
});

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
    jarvisState.status = event.data;
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
          addLog(`Microphone changed to ${data.microphoneIndex === null ? "default" : `index ${data.microphoneIndex}`}`);
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

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  jarvis.stop();
  server.stop();
  process.exit(0);
});
