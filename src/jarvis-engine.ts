import { spawn, type ChildProcess } from "child_process";
import { stepCountIs, experimental_transcribe as transcribe } from 'ai';
import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';
import { readFile } from "fs/promises";
import { join } from "path";
import { TextToSpeech } from "./tts";
import { datetimeTool, calculatorTool, systemInfoTool } from "./tools";
import { createProjectTool, switchProjectTool, listProjectsTool, addTodoTool, listTodosTool, completeTodoTool, deleteTodoTool, updateNotesTool } from "./tools/memory-tools";
import { memory } from "./memory";

export interface JarvisConfig {
  microphoneIndex: number | null; // null = default
  groqApiKey: string;
}

export type JarvisStatus =
  | "idle"
  | "listening"
  | "wake-word-detected"
  | "recording"
  | "processing"
  | "error";

export interface JarvisEvent {
  type: "status" | "wake-word" | "transcription" | "response" | "error" | "log";
  data: any;
}

export class JarvisEngine {
  private config: JarvisConfig;
  private tts: TextToSpeech;
  private wakeWordDetector: ChildProcess | null = null;
  private status: JarvisStatus = "idle";
  private eventHandlers: Map<string, Set<(event: JarvisEvent) => void>> = new Map();

  constructor(config: JarvisConfig) {
    this.config = config;
    this.tts = new TextToSpeech(config.groqApiKey, 'Basil-PlayAI');
  }

  on(type: string, handler: (event: JarvisEvent) => void) {
    if (!this.eventHandlers.has(type)) {
      this.eventHandlers.set(type, new Set());
    }
    this.eventHandlers.get(type)!.add(handler);
  }

  off(type: string, handler: (event: JarvisEvent) => void) {
    this.eventHandlers.get(type)?.delete(handler);
  }

  private emit(event: JarvisEvent) {
    this.eventHandlers.get(event.type)?.forEach((handler) => handler(event));
    this.eventHandlers.get("*")?.forEach((handler) => handler(event));
  }

  async start() {
    this.updateStatus("listening");

    const args = [
      "--with",
      "tensorflow",
      "--with",
      "librosa",
      "--with",
      "pyaudio",
      "--with",
      "numpy",
      "python3",
      "scripts/unified_voice.py",
    ];

    if (this.config.microphoneIndex !== null) {
      args.push(this.config.microphoneIndex.toString());
    }

    this.wakeWordDetector = spawn("uvx", args);

    this.wakeWordDetector.stdout.on("data", async (data: Buffer) => {
      const message = data.toString().trim();

      if (message === "READY") {
        this.emit({ type: "log", data: "Voice system ready" });
      } else if (message.startsWith("DETECTED:")) {
        // Ignore wake word detections while busy
        if (this.status !== "listening") {
          return;
        }

        const confidence = parseFloat(message.split(":")[1]);
        this.updateStatus("wake-word-detected");
        this.emit({ type: "wake-word", data: { confidence } });

        // Play sound on wake word detection
        spawn("afplay", ["/System/Library/Sounds/Glass.aiff"]);

        // Set recording flag (actual recording happens in unified script)
        this.isRecording = true;
        this.updateStatus("recording");
      } else if (message.startsWith("DEBUG:")) {
        this.emit({ type: "log", data: message.replace("DEBUG: ", "") });
      } else if (message === "RECORDING_COMPLETE") {
        await this.handleRecordingComplete();
      }
    });

    this.wakeWordDetector.stderr.on("data", (data: Buffer) => {
      const msg = data.toString();
      if (!msg.includes("WARNING") && !msg.includes("FutureWarning")) {
        this.emit({ type: "log", data: msg });
      }
    });

    this.wakeWordDetector.on("error", (error) => {
      this.updateStatus("error");
      this.emit({ type: "error", data: error.message });
    });
  }

  stop() {
    this.wakeWordDetector?.kill();
    this.wakeWordDetector = null;
    this.updateStatus("idle");
  }

  private updateStatus(status: JarvisStatus) {
    this.status = status;
    this.emit({ type: "status", data: status });
  }

  private isRecording = false;

  private async generateResponse(userInput: string): Promise<{ text: string; speechText: string; expectsFollowUp: boolean }> {
    try {
      const context = await memory.getContext();

      const projectInfo = context.currentProject
        ? `Current project: ${context.currentProject}. Todos: ${context.activeTodos.map((t: any) => t.text).join(', ') || 'none'}.`
        : 'No active project.';

      const notesInfo = Object.keys(context.notes).length > 0
        ? `Notes: ${JSON.stringify(context.notes)}`
        : 'No notes saved.';

      const result = await generateText({
        model: groq('meta-llama/llama-4-scout-17b-16e-instruct'),
        system: `You are JARVIS from Iron Man - a sophisticated British AI assistant. Address user as "Sir".
Be professional and slightly witty. Speak naturally like a human - use contractions and casual phrasing.

${projectInfo}
${notesInfo}

CRITICAL: Always respond with a single JSON object (NOT an array). Format:
{"displayText": "text", "speechText": "text", "expectFollowUp": false}

displayText: Can be detailed, with full information.
speechText: Should be natural and conversational, but reasonably concise (2-3 sentences). This is spoken aloud via TTS.

WORKFLOW:
1. If user needs tools (datetime, listTodos, etc), call them first
2. Return ONE JSON object (not an array!)

SPEECH RULES:
- speechText should sound natural when spoken aloud
- Include key information, but avoid long lists or excessive detail
- Aim for 15-40 words typically
- displayText can have more details, formatted lists, etc.
- Be conversational in speechText - speak like you would to a person

IMPORTANT: Set expectFollowUp=false for almost ALL responses. Only set true if asking a direct question that REQUIRES an immediate answer.

DO NOT set expectFollowUp=true for: statements, confirmations, info delivery, casual conversation, or completed commands.

Examples:
- "tell me about yourself" → {"displayText": "I'm JARVIS, your AI assistant. I can help with tasks, manage projects, answer questions, and more.", "speechText": "I'm JARVIS, Sir. I'm your AI assistant, here to help with tasks, projects, and questions.", "expectFollowUp": false}
- "what time is it" → Call datetime, then {"displayText": "It's 3:56 PM", "speechText": "It's 3:56 PM, Sir", "expectFollowUp": false}
- "create a todo to buy milk" → {"displayText": "Todo created: Buy milk", "speechText": "I've added that to your list, Sir", "expectFollowUp": false}
- "what's on my todo list" → Call listTodos, then {"displayText": "Your todos:\n1. Buy milk\n2. Call dentist\n3. Fix bug", "speechText": "You have three items, Sir. Buy milk, call the dentist, and fix a bug", "expectFollowUp": false}

Default to expectFollowUp=false unless absolutely necessary.`,
        prompt: userInput,
        tools: {
          datetime: datetimeTool,
          calculator: calculatorTool,
          systemInfo: systemInfoTool,
          createProject: createProjectTool,
          switchProject: switchProjectTool,
          listProjects: listProjectsTool,
          addTodo: addTodoTool,
          listTodos: listTodosTool,
          completeTodo: completeTodoTool,
          deleteTodo: deleteTodoTool,
          updateNotes: updateNotesTool
        },
        stopWhen: stepCountIs(5),
        onStepFinish: ({ toolCalls }) => {
          // Log tool calls concisely
          for (const toolCall of toolCalls) {
            const args = JSON.stringify(toolCall.args || toolCall.input || {});
            this.emit({
              type: "log",
              data: `🔧 ${toolCall.toolName}${args.length > 50 ? '(...)' : `(${args})`}`
            });
          }
        }
      });

      // Parse JSON response from AI
      const responseText = result.text || '{"displayText": "Understood, Sir.", "speechText": "Understood, Sir.", "expectFollowUp": false}';

      let response;
      try {
        response = JSON.parse(responseText);
      } catch (e) {
        // Fallback if JSON parsing fails
        response = {
          displayText: responseText,
          speechText: responseText,
          expectFollowUp: false
        };
      }

      return {
        text: response.displayText,
        speechText: response.speechText,
        expectsFollowUp: response.expectFollowUp
      };
    } catch (error: any) {
      console.error("AI Error:", error);
      this.emit({ type: "log", data: `Full error: ${JSON.stringify(error, null, 2)}` });

      // Return a fallback response instead of crashing
      return {
        text: "I apologize, Sir. I encountered an error processing your request.",
        speechText: "I apologize, Sir. I encountered an error processing your request.",
        expectsFollowUp: false
      };
    }
  }

  private async handleRecordingComplete() {
    this.updateStatus("processing");

    const tempFile = join(process.cwd(), "command.wav");

    try {
      // Step 1: Transcribe audio using AI SDK
      const audioBuffer = await readFile(tempFile);
      const transcriptResult = await transcribe({
        model: groq.transcription('whisper-large-v3-turbo'),
        audio: audioBuffer,
        providerOptions: {
          groq: {
            language: 'en',
            temperature: 0
          }
        }
      });

      const transcriptionText = transcriptResult.text;
      this.emit({ type: "transcription", data: transcriptionText });

      // Step 2: Generate AI response with tools
      const { text: displayText, speechText, expectsFollowUp } = await this.generateResponse(transcriptionText);
      this.emit({ type: "response", data: displayText });

      // Step 3: Speak the response via TTS
      try {
        if (speechText && speechText.trim().length > 0) {
          await this.tts.speak(speechText);
        }
      } catch (ttsError: any) {
        this.emit({ type: "log", data: `TTS failed: ${ttsError.message}` });
      }

      this.isRecording = false;

      // If follow-up expected, trigger immediate recording
      if (expectsFollowUp) {
        this.emit({ type: "log", data: "Listening for follow-up..." });
        this.updateStatus("recording");
        // Send command to unified script to record immediately
        this.wakeWordDetector?.stdin?.write("RECORD_NOW\n");
      } else {
        this.updateStatus("listening");
      }
    } catch (error: any) {
      this.emit({ type: "error", data: error?.message || "Processing failed" });
      this.updateStatus("listening");
      this.isRecording = false;
    }
  }

  getStatus(): JarvisStatus {
    return this.status;
  }

  async updateMicrophone(index: number | null) {
    const wasRunning = this.wakeWordDetector !== null;
    if (wasRunning) {
      this.stop();
    }
    this.config.microphoneIndex = index;
    if (wasRunning) {
      // Wait a bit for the previous process to fully close
      await new Promise((resolve) => setTimeout(resolve, 500));
      await this.start();
    }
  }
}
