# JARVIS

A voice-activated AI assistant with custom wake word detection, inspired by JARVIS from Iron Man.

## Features

- **Custom Wake Word Detection**: Train your own "Jarvis" wake word model
- **Voice Commands**: Natural language interaction with AI (Llama 4 Scout)
- **Project & Todo Management**: Organize tasks by project with persistent storage
- **Text-to-Speech**: British-accented responses
- **Terminal UI**: Clean interface with real-time status and logs

## Project Structure

```
jarvis/
├── src/                      # TypeScript source code
│   ├── ui/                   # Terminal UI components
│   ├── tools/                # AI tool definitions
│   ├── jarvis-engine.ts      # Main AI coordination
│   ├── memory.ts             # Local JSON database
│   └── tts.ts                # Text-to-speech
├── scripts/                  # Python scripts
│   ├── training/             # Model training scripts
│   │   ├── 1_collect_samples.py
│   │   ├── 2_train_model.py
│   │   └── 3_test_model.py
│   ├── utils/                # Utility scripts
│   │   ├── normalize_and_renumber.py
│   │   └── clean_*.py
│   ├── run_inference.py      # Production wake word detection
│   └── record_command.py     # Audio recording
├── jarvis_model/             # Trained TensorFlow model (gitignored)
└── training_data/            # Audio samples (gitignored)
```

## Prerequisites

- **uvx**: Fast Python package manager (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- **Bun**: JavaScript runtime

## Setup

1. Install dependencies:
```bash
bun install
```

2. Set up environment:
```bash
echo "GROQ_API_KEY=your_key_here" > .env
```

3. Train your wake word model:
```bash
# Collect samples (say "Jarvis" ~100 times)
uvx --with pyaudio --with numpy python3 scripts/training/1_collect_samples.py

# Train model
uvx --with tensorflow --with librosa python3 scripts/training/2_train_model.py

# Test model
uvx --with tensorflow --with librosa --with pyaudio python3 scripts/training/3_test_model.py
```

4. Run JARVIS:
```bash
# Terminal UI mode
bun run src/index.tsx

# Web UI daemon mode (runs on http://localhost:7777)
bun run daemon
```

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
- "Create project [name]"
- "Add todo [task]"
- "List todos"
- "Complete todo [number]"
- "What time is it?"
- And more natural language commands...

## Tech Stack

- **Runtime**: Bun
- **UI**: OpenTUI (React for terminal)
- **AI**: Groq (Llama 4 Scout + Whisper + TTS)
- **Wake Word**: Custom TensorFlow/Keras model
- **Database**: lowdb (local JSON)
