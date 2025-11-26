# JARVIS

A voice-activated AI assistant with custom wake word detection, inspired by JARVIS from Iron Man. Features autonomous coding capabilities via Claude Agent SDK, dual UI modes (terminal and web), and comprehensive voice control.

## Features

- **Custom Wake Word Detection**: Train your own "Jarvis" wake word model using TensorFlow
- **Voice Commands**: Natural language interaction with AI (Groq's Llama + Whisper)
- **Autonomous Coding Sessions**: Claude Agent SDK integration with automatic PR creation
- **Multi-Mode UI**: Both terminal (TUI) and web daemon modes
- **System Control**: Spotify integration, volume control, microphone switching
- **Reminder Management**: Voice-controlled reminders
- **Text-to-Speech**: British-accented responses via Groq TTS
- **Context Awareness**: Maintains conversation history and project context

## Project Structure

```
jarvis/
├── src/                      # TypeScript source code
│   ├── ui/                   # Terminal UI components (React with OpenTUI)
│   │   ├── App.tsx           # Main TUI application
│   │   ├── AudioVisualizer.tsx
│   │   └── SoundWave.tsx
│   ├── web/                  # Web UI components
│   │   └── app.tsx           # Web interface for daemon mode
│   ├── tools/                # AI tool definitions
│   │   ├── claude-agent.ts   # Claude SDK coding sessions
│   │   ├── spotify.ts        # Spotify playback control
│   │   ├── volume.ts         # System volume control
│   │   ├── reminder-tools.ts # Reminder management
│   │   ├── datetime.ts       # Time/date queries
│   │   ├── calculator.ts     # Math operations
│   │   └── microphone.ts     # Microphone switching
│   ├── claude-agent/         # Claude Agent SDK integration
│   │   ├── manager.ts        # Session management
│   │   ├── repository.ts     # Git repository handling
│   │   ├── worktree.ts       # Git worktree operations
│   │   └── pr-utils.ts       # Automatic PR creation
│   ├── memory/               # Persistent storage
│   │   ├── conversation-history.ts
│   │   ├── reminders.ts
│   │   └── common-words.ts
│   ├── jarvis-engine.ts      # Main AI coordination
│   ├── daemon.ts             # Web server + WebSocket daemon
│   ├── index.tsx             # Terminal UI entry point
│   └── tts.ts                # Text-to-speech
├── scripts/                  # Python scripts
│   ├── training/             # Model training scripts
│   │   ├── 1_collect_samples.py
│   │   ├── 2_train_model.py
│   │   └── 3_test_model.py
│   ├── utils/                # Audio processing utilities
│   ├── unified_voice.py      # Combined wake word + voice recording
│   └── list_microphones.py   # List available audio devices
├── .memory/                  # Runtime data (gitignored)
│   ├── jarvis-memory.json    # Projects, todos, settings
│   └── code-sessions/        # Code session logs + metadata
├── jarvis_model/             # Trained TensorFlow model (gitignored)
└── training_data/            # Audio samples (gitignored)
```

## Prerequisites

- **uvx**: Fast Python package manager (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- **Bun**: JavaScript runtime (`curl -fsSL https://bun.sh/install | bash`)
- **gh CLI**: GitHub CLI for PR creation (`brew install gh && gh auth login`)
- **Spotify**: For music control features (optional)
- **Tailscale**: For remote web access (optional)

## Setup

1. Install dependencies:
```bash
bun install
```

2. Set up environment:
```bash
cp .env.example .env
# Edit .env and add your API keys:
# GROQ_API_KEY=your_groq_api_key
# ANTHROPIC_API_KEY=your_anthropic_api_key  (for Claude coding sessions)
```

3. Train your wake word model:
```bash
# Collect samples (say "Jarvis" ~100 times)
bun run collect

# Train model
bun run train

# Test model
bun run test-model
```

4. Run JARVIS:
```bash
# Terminal UI mode (interactive TUI)
bun start

# Web UI daemon mode (web interface + WebSocket server)
bun run daemon
```

The daemon mode serves:
- Web UI at `http://localhost:7777`
- WebSocket API at `ws://localhost:7777/ws`
- REST API at `http://localhost:7777/api/*`

## Running in Background (tmux)

To run the daemon in the background without keeping a terminal open:

```bash
# Start daemon in detached tmux session
tmux new-session -d -s jarvis -c ~/projects/jarvis "bun run daemon"

# Check if running
tmux list-sessions | grep jarvis

# View logs (attach to session)
tmux attach-session -t jarvis
# Press Ctrl+B, then D to detach

# Stop daemon
tmux kill-session -t jarvis
```

**tmux Keybinds**:
- `Ctrl+B D` - Detach from session (daemon keeps running)
- `Ctrl+B [` - Scroll mode (use arrow keys, `q` to exit)
- `Ctrl+C` - Stop the daemon (while attached)

## Usage

**Wake Word**: Say "Jarvis" to activate

**Keyboard Shortcuts**:
- **m** - Change microphone
- **p** - Replay last command
- **c** - Copy logs to clipboard
- **q** - Quit

**Voice Commands**:

*Coding & Development:*
- "Create a coding session to add authentication to Cookify"
- "Create a coding session with worktree to add dark mode" (auto-creates PR)
- "What's the status of my coding session?"
- "List all coding sessions"

*Projects & Tasks:*
- "Create project [name]"
- "Add todo [task]"
- "List todos"
- "Complete todo [number]"

*Reminders:*
- "Set a reminder for [task] at [time]"
- "List my reminders"
- "Delete reminder [number]"

*System Control:*
- "What time is it?"
- "Set volume to [0-100]"
- "Change microphone"
- "Play/pause Spotify"
- "Next/previous track"
- "What's playing?"
- "Turn shuffle on/off"

And more natural language commands...

## Tech Stack

- **Runtime**: Bun
- **UI**:
  - Terminal: OpenTUI (React for terminal)
  - Web: React + WebSocket
- **AI**:
  - Groq (Llama 4 Scout + Whisper + TTS)
  - Claude Agent SDK (autonomous coding)
  - Anthropic Claude (via Agent SDK)
- **Wake Word**: Custom TensorFlow/Keras model
- **Database**: lowdb (local JSON)
- **Audio**: PyAudio + librosa + soundfile
- **Git**: Native git + gh CLI for PR automation
- **System Integration**: ioctl (volume), AppleScript (Spotify)

## Advanced Features

### Autonomous Coding with Claude Agent SDK

Jarvis can spawn autonomous coding sessions using Claude Agent SDK:

```
"Jarvis, create a coding session with worktree to add user authentication"
```

This will:
1. Create an isolated git worktree branch
2. Spawn a Claude Agent SDK session with your task
3. Let Claude autonomously write code, create files, and make changes
4. Automatically commit changes when done
5. Push to remote and create a GitHub PR
6. Report the PR URL back to you

See [PR_FLOW.md](PR_FLOW.md) for detailed documentation.

### Web Daemon Mode with Tailscale

Run Jarvis as a web service accessible from any device:

```bash
bun run daemon
```

Access from anywhere via Tailscale:
- Configure WebSocket URL in web UI
- Control Jarvis from phone, tablet, or other computers
- Real-time status updates via WebSocket
- Audio visualizer and live logs

See [DAEMON.md](DAEMON.md) for setup instructions.

### Custom Wake Word Training

Train a personalized wake word model:

1. **Collect samples**: Record yourself saying "Jarvis" 100+ times
2. **Train model**: Uses TensorFlow/Keras with MFCC features
3. **Test accuracy**: Verify detection rate before deployment

The model runs locally with low latency (~50ms inference time).

## Architecture

```
┌─────────────────┐
│  Wake Word      │  Custom TensorFlow model
│  Detection      │  Continuous audio monitoring
└────────┬────────┘
         │ "Jarvis" detected
         ▼
┌─────────────────┐
│  Voice          │  Groq Whisper API
│  Transcription  │  Audio → Text
└────────┬────────┘
         │ Text command
         ▼
┌─────────────────┐
│  AI Engine      │  Groq Llama 4 Scout
│  (Tool Calling) │  Function calling with tools
└────────┬────────┘
         │ Tool execution
         ▼
┌─────────────────────────────────────┐
│  Tools:                             │
│  • Claude Agent SDK (coding)        │
│  • Spotify Control (playback)       │
│  • Volume Control (system audio)    │
│  • Reminders (scheduled tasks)      │
│  • Memory (projects/todos)          │
│  • Calculator, DateTime, etc.       │
└────────┬────────────────────────────┘
         │ Response text
         ▼
┌─────────────────┐
│  Text-to-Speech │  Groq TTS (British accent)
│  (TTS)          │  Text → Audio
└─────────────────┘
```

## Available Scripts

```bash
bun start           # Run terminal UI
bun run daemon      # Run web daemon
bun run collect     # Collect wake word samples
bun run train       # Train wake word model
bun run test-model  # Test model accuracy
bun run list-mics   # List available microphones
bun run add-word    # Add word to common words dictionary
bun run build       # Build web UI
```

## Documentation

- **[DAEMON.md](DAEMON.md)** - Web daemon setup, Tailscale configuration, background service
- **[PR_FLOW.md](PR_FLOW.md)** - Autonomous coding sessions, automatic PR creation
- **[CLAUDE.md](CLAUDE.md)** - Claude Agent SDK integration details

## Troubleshooting

### Wake word not detecting
- Check microphone permissions in System Settings
- Ensure `jarvis_model/` directory exists with trained model
- Test model accuracy with `bun run test-model`
- Adjust microphone input volume

### Coding sessions failing
- Verify `ANTHROPIC_API_KEY` in `.env`
- Check `gh auth status` for GitHub CLI authentication
- Ensure repository has remote configured

### Audio issues
- List available microphones: `bun run list-mics`
- Try switching microphone in TUI (press `m`) or web UI
- Check Python audio dependencies are installed

### Daemon connection issues
- Verify port 7777 is not in use: `lsof -ti:7777`
- For Tailscale: ensure both devices are connected
- Check firewall allows port 7777

## Environment Variables

```bash
GROQ_API_KEY         # Required: Groq API for LLM, transcription, TTS
ANTHROPIC_API_KEY    # Required for Claude coding sessions
```

## License

MIT
