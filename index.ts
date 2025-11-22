import Groq from "groq-sdk";
import recorder from "node-record-lpcm16";
import { MicVAD } from "@ricky0123/vad-node";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";

// Initialize Groq
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

let isRecording = false;
let vad: any;

console.log("🎙️  Jarvis Voice Assistant");
console.log("=".repeat(50));
console.log("Starting wake word detection...\n");

// Spawn Python wake word detector
const wakeWordProcess = spawn("uvx", [
  "--from",
  "openwakeword",
  "--with",
  "pyaudio",
  "python3",
  "wake_word.py",
]);

wakeWordProcess.stdout.on("data", async (data: Buffer) => {
  const message = data.toString().trim();

  if (message === "READY") {
    console.log("👂 Listening for wake word: 'Hey Jarvis'...\n");
  } else if (message === "DETECTED" && !isRecording) {
    console.log("\n🎯 Wake word detected!");
    isRecording = true;

    // Initialize VAD if not already done
    if (!vad) {
      vad = await MicVAD.new({
        onSpeechEnd: async (audio) => {
          if (!isRecording) return;

          console.log("🔄 Processing speech...");
          isRecording = false;

          // Convert Float32Array to WAV file
          const tempFile = join(process.cwd(), "temp_audio.wav");
          const buffer = Buffer.from(audio.buffer);
          writeFileSync(tempFile, buffer);

          try {
            // Transcribe with Groq
            const transcription = await groq.audio.transcriptions.create({
              file: Bun.file(tempFile),
              model: "whisper-large-v3-turbo",
              language: "en",
            });

            console.log("\n✅ You said:", transcription.text);
            console.log("\n" + "=".repeat(50));
            console.log("👂 Listening for wake word: 'Hey Jarvis'...\n");

            // Clean up temp file
            unlinkSync(tempFile);
          } catch (error) {
            console.error("❌ Error transcribing:", error);
            console.log("\n👂 Listening for wake word: 'Hey Jarvis'...\n");
          }
        },

        onSpeechStart: () => {
          if (isRecording) {
            console.log("🎤 Listening... (speak now)");
          }
        },
      });
    }

    vad.start();
  }
});

wakeWordProcess.stderr.on("data", (data: Buffer) => {
  // Ignore Python warnings
  const msg = data.toString();
  if (!msg.includes("UserWarning") && !msg.includes("FutureWarning")) {
    console.error("Wake word error:", msg);
  }
});

// Handle exit
process.on("SIGINT", () => {
  console.log("\n\n👋 Shutting down Jarvis...");
  wakeWordProcess.kill();
  if (vad) vad.destroy();
  process.exit(0);
});

process.on("exit", () => {
  wakeWordProcess.kill();
});
