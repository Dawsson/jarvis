# Jarvis Daemon Mode

This guide explains how to run Jarvis as a daemon with a web interface that can be accessed from any computer on your network (including via Tailscale).

## Quick Start

### 1. Start the Daemon

```bash
bun run daemon
```

The daemon will:
- Start the Jarvis engine with wake word detection
- Launch a WebSocket server on port 7777
- Serve a web interface at http://localhost:7777

### 2. Access the Web Interface

Open your browser and go to:
```
http://localhost:7777
```

You'll see a sleek, Apple-inspired interface showing:
- Real-time status (Idle, Listening, Recording, Processing)
- Activity logs
- Transcriptions and responses
- Current project and todos
- Live audio visualizer

## Features

### Configurable WebSocket URL

The web interface allows you to configure the WebSocket URL, making it perfect for Tailscale setups:

1. Click the **⚙️ Configure** button in the top right
2. Enter your WebSocket URL (e.g., `ws://macbook.tailnet-name.ts.net:7777/ws`)
3. Click **Save**

The URL is saved in localStorage, so you only need to set it once per browser.

### Microphone Selection

You can change the microphone while the daemon is running:

1. Click the **🎤 Microphone** button in the top right
2. Select from available microphones or choose "System Default"
3. The daemon will restart with the new microphone automatically

## Tailscale Setup

To access Jarvis from another computer using Tailscale:

### 1. Install Tailscale

On both your Mac (running the daemon) and the computer you want to access it from:
```bash
# macOS
brew install tailscale

# Start Tailscale
sudo tailscaled install-system-daemon
tailscale up
```

### 2. Enable MagicDNS

In your Tailscale admin console (https://login.tailscale.com/admin/dns):
- Enable MagicDNS
- Note your machine's hostname (e.g., `macbook`)

### 3. Start the Daemon on Your Mac

```bash
bun run daemon
```

### 4. Access from Another Computer

On your other computer, open a browser and go to:
```
http://macbook.tailnet-name.ts.net:7777
```

Or use the Tailscale IP directly:
```
http://100.x.x.x:7777
```

### 5. Configure the WebSocket URL

In the web interface:
1. Click **⚙️ Configure**
2. Set the WebSocket URL to: `ws://macbook.tailnet-name.ts.net:7777/ws`
3. Click **Save**

The interface will now connect to your Mac's Jarvis daemon via Tailscale!

## API Endpoints

The daemon exposes several HTTP endpoints:

- `GET /` - Web interface
- `GET /api/state` - Current Jarvis state (JSON)
- `GET /api/microphones` - List available microphones (JSON)
- `WebSocket /ws` - Real-time events

## WebSocket Events

The daemon broadcasts these events to all connected clients:

### Server → Client

```typescript
// Connected
{ type: "connected", data: { timestamp: string } }

// Jarvis events
{ type: "jarvis-event", event: JarvisEvent }

// Error
{ type: "error", message: string }
```

### Client → Server

```typescript
// Ping
{ type: "ping" }

// Change microphone
{ type: "change-microphone", microphoneIndex: number | null }
```

## Running as a Background Service

### macOS (launchd)

Create a file at `~/Library/LaunchAgents/com.jarvis.daemon.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.jarvis.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/bun</string>
        <string>run</string>
        <string>daemon</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/YOUR_USERNAME/projects/jarvis</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/jarvis.out.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/jarvis.err.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>GROQ_API_KEY</key>
        <string>YOUR_GROQ_API_KEY</string>
    </dict>
</dict>
</plist>
```

Load and start:
```bash
launchctl load ~/Library/LaunchAgents/com.jarvis.daemon.plist
```

## Architecture

```
┌─────────────────┐
│  Web Browser    │
│  (Any Device)   │
└────────┬────────┘
         │ WebSocket
         │ (via Tailscale)
         ▼
┌─────────────────┐
│  Bun Server     │
│  :7777          │
├─────────────────┤
│  • HTTP Routes  │
│  • WebSocket    │
│  • Frontend     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Jarvis Engine   │
├─────────────────┤
│ • Wake Word     │
│ • Transcription │
│ • AI Response   │
│ • TTS           │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Python Script  │
│  unified_voice  │
└─────────────────┘
```

## Troubleshooting

### Port Already in Use

If port 7777 is already in use:
```bash
lsof -ti:7777 | xargs kill
```

### WebSocket Connection Failed

1. Check that the daemon is running
2. Verify the WebSocket URL is correct
3. Make sure firewall allows port 7777
4. For Tailscale, ensure both devices are connected

### Microphone Not Working

1. Check microphone permissions in System Settings
2. Try selecting a different microphone in the web interface
3. Check the daemon logs for errors

### Wake Word Not Detecting

1. Ensure Python dependencies are installed
2. Check microphone input levels
3. Try speaking louder or closer to the microphone
4. Verify the wake word model exists in `scripts/models/`

## Environment Variables

Required:
- `GROQ_API_KEY` - Your Groq API key for transcription and AI

## TUI vs Daemon Mode

- **TUI Mode** (`bun start`): Terminal-based interface, runs in foreground
- **Daemon Mode** (`bun run daemon`): Web-based interface, can run in background

Both modes use the same Jarvis engine under the hood!
