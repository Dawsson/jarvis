# Jarvis Voice Assistant

A voice-activated assistant that listens for "Hey Jarvis" and transcribes your speech using Groq's ultra-fast Whisper API.

## How It Works

1. **OpenWakeWord** continuously listens for "Hey Jarvis" (runs 100% locally, no API calls!)
2. When detected, starts recording your voice
3. **VAD** (Voice Activity Detection) automatically detects when you stop speaking
4. Sends audio to **Groq Whisper** for transcription (blazing fast!)
5. Displays the transcribed text
6. Returns to listening for wake word

## Prerequisites

- **uv/uvx**: Fast Python package manager (install: `curl -LsSf https://astral.sh/uv/install.sh | sh`)
- **Bun**: JavaScript runtime (you already have this)

## Setup

1. Install Node dependencies:
   ```bash
   bun install
   ```

2. Get your Groq API key:
   - Get free API key at https://console.groq.com

3. Create `.env` file:
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` and add your Groq API key.

4. Run Jarvis:
   ```bash
   bun run index.ts
   ```

   On first run, `uvx` will automatically install OpenWakeWord and PyAudio.

## Usage

1. Start the app
2. Say "Hey Jarvis" to activate
3. Speak your command or question
4. Stop talking and wait for transcription
5. Repeat!

Press `Ctrl+C` to exit.

## Why This Stack?

- **OpenWakeWord**: 100% local, no API keys, trained on "Hey Jarvis"
- **Groq**: 10-20x faster than other Whisper providers
- **uvx**: No Python environment setup needed, handles dependencies automatically
