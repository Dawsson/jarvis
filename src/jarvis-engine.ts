import { spawn, type ChildProcess } from "child_process";
import { stepCountIs, experimental_transcribe as transcribe } from 'ai';
import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';
import { readFile } from "fs/promises";
import { join } from "path";
import { TextToSpeech } from "./tts";
import { IntentDetector } from "./intent-detector";
import {
  datetimeTool,
  calculatorTool,
  systemInfoTool,
  spotifyPlayTool,
  spotifyPauseTool,
  spotifyPlayPauseTool,
  spotifyNextTool,
  spotifyPreviousTool,
  spotifyCurrentTrackTool,
  spotifyShuffleTool,
  volumeTool,
  setMicrophoneTool,
  setEngineInstance,
  contextDumpTool,
  createClaudeSessionTool,
  getClaudeSessionStatusTool,
  sendToClaudeSessionTool,
  listClaudeSessionsTool,
  deleteClaudeSessionTool,
  showOnScreenTool
} from "./tools";
import { createProjectTool, switchProjectTool, listProjectsTool, addTodoTool, listTodosTool, completeTodoTool, deleteTodoTool, updateNotesTool } from "./tools/memory-tools";
import { addReminderTool, listRemindersTool, deleteReminderTool } from "./tools/reminder-tools";
import { memory } from "./memory";
import { conversationHistory } from "./memory/conversation-history";
import { reminders } from "./memory/reminders";

export interface JarvisConfig {
  microphoneIndex: number | null; // null = default
  groqApiKey: string;
  microphoneName?: string; // Optional: name of the microphone device
  useWakeWord?: boolean; // Default true, set to false for keyboard mode
  alwaysListening?: boolean; // Default false, enables continuous transcription with intent detection
  intentThreshold?: number; // Default 0.7, confidence threshold for intent detection (0-1)
}

export type JarvisStatus =
  | "idle"
  | "listening"
  | "wake-word-detected"
  | "recording"
  | "transcribing"
  | "intent-checking"
  | "processing"
  | "error";

export interface JarvisEvent {
  type: "status" | "wake-word" | "transcription" | "response" | "error" | "log" | "background-speech" | "intent-detected";
  data: any;
}

export class JarvisEngine {
  private config: JarvisConfig;
  private tts: TextToSpeech;
  private wakeWordDetector: ChildProcess | null = null;
  private status: JarvisStatus = "idle";
  private eventHandlers: Map<string, Set<(event: JarvisEvent) => void>> = new Map();
  private intentDetector: IntentDetector;
  private lastWakeWordDetected: boolean = false;
  private stderrBuffer: string = "";
  private isMuted: boolean = false;

  constructor(config: JarvisConfig) {
    this.config = config;
    this.tts = new TextToSpeech(config.groqApiKey, 'Basil-PlayAI');
    this.intentDetector = new IntentDetector(
      config.groqApiKey,
      config.intentThreshold ?? 0.7
    );
    // Register this engine instance so tools can access it
    setEngineInstance(this);
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
      "--with",
      "torch",
      "--with",
      "torchaudio",
      "python3",
      "scripts/unified_voice.py",
    ];

    if (this.config.microphoneIndex !== null) {
      args.push(this.config.microphoneIndex.toString());
    }

    // Add --no-wake-word flag if wake word is disabled (keyboard-only mode)
    if (this.config.useWakeWord === false) {
      args.push("--no-wake-word");
    }

    // Add --always-listening flag if enabled
    if (this.config.alwaysListening === true) {
      args.push("--always-listening");
    }

    this.wakeWordDetector = spawn("uvx", args);

    this.wakeWordDetector.stdout.on("data", async (data: Buffer) => {
      const output = data.toString();
      // Split by newlines and process each line separately
      const lines = output.split('\n').map(line => line.trim()).filter(line => line.length > 0);

      for (const message of lines) {
        // Skip Python debug messages that start with emojis or DEBUG:
        const isDebugMessage = message.startsWith("🐍") || message.startsWith("DEBUG:");

        if (message === "READY") {
        const readyMsg = this.config.alwaysListening
          ? "🎤 Voice system ready - Always listening mode"
          : this.config.useWakeWord === false
            ? "⌨️  Recording system ready (keyboard mode)"
            : "🎤 Voice system ready";
        console.log(readyMsg);
        this.emit({ type: "log", data: readyMsg });
      } else if (message.startsWith("DETECTED:")) {
        const confidence = parseFloat(message.split(":")[1]);

        // Ignore if muted
        if (this.isMuted) {
          return;
        }

        // Mark that wake word was detected (for intent detection bypass)
        this.lastWakeWordDetected = true;

        // If Jarvis is currently speaking (processing), cancel the speech
        if (this.status === "processing") {
          this.emit({ type: "log", data: "Interrupted by wake word - stopping speech" });
          this.emit({ type: "wake-word", data: { confidence, interrupted: true } });
          this.tts.cancel();
          this.isRecording = false;
          this.updateStatus("listening");
          return;
        }

        // Ignore wake word detections while busy (but not while processing/speaking)
        if (this.status !== "listening") {
          return;
        }

        this.updateStatus("wake-word-detected");
        console.log(`🎯 Wake word detected (${(confidence * 100).toFixed(0)}%)`);
        this.emit({ type: "wake-word", data: { confidence } });

        // Play sound on wake word detection
        spawn("afplay", ["/System/Library/Sounds/Glass.aiff"]);

        // Set recording flag (actual recording happens in unified script)
        this.isRecording = true;
        this.updateStatus("recording");
      } else if (message.startsWith("DEBUG:")) {
        // Skip debug messages (too noisy)
        continue;
      } else if (message === "RECORDING_COMPLETE") {
        await this.handleRecordingComplete();
      } else if (message.startsWith("SPEECH_SEGMENT")) {
        // Parse wake word confidence if provided (format: "SPEECH_SEGMENT:0.85")
        const parts = message.split(":");
        const wakeWordConfidence = parts.length > 1 ? parseFloat(parts[1]) : 0.0;
        await this.handleSpeechSegment(wakeWordConfidence);
      } else if (!isDebugMessage) {
        // Only log non-debug messages we don't recognize
        console.log(`⚠️  Unknown: ${message}`);
      }
      }
    });

    this.wakeWordDetector.stderr.on("data", (data: Buffer) => {
      // Buffer stderr output to handle incomplete lines
      this.stderrBuffer += data.toString();

      // Process complete lines
      const lines = this.stderrBuffer.split('\n');
      // Keep the last incomplete line in buffer
      this.stderrBuffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim().length === 0) continue;

        // Log all stderr output to console
        console.error(`⚠️ [Python stderr] ${line}`);

        // Emit errors (but filter out common warnings)
        if (!line.includes("WARNING") && !line.includes("FutureWarning") && !line.includes("UserWarning")) {
          this.emit({ type: "error", data: line });
        }
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
    // Unregister engine instance when stopped
    setEngineInstance(null);
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

      const micInfo = context.preferredMicrophone
        ? `Preferred microphone: ${context.preferredMicrophone}`
        : 'Using default microphone.';

      const customWordsInfo = context.customWords && context.customWords.length > 0
        ? `Custom words for recognition: ${context.customWords.map((cw: any) => {
            if (cw.phonetic) {
              return `${cw.word} (sounds like: ${cw.phonetic})`;
            }
            return cw.word;
          }).join(', ')}`
        : 'No custom words saved.';

      // Get active reminders
      const activeReminders = await reminders.getActive();
      const remindersInfo = activeReminders.length > 0
        ? `Active reminders:\n${activeReminders.map((r: any) =>
            `- "${r.text}" at ${new Date(r.scheduledTime).toLocaleString()}`
          ).join('\n')}`
        : 'No active reminders.';

      // Get available repositories for coding sessions
      const { loadRepositories, formatRepositoriesForContext, getCurrentRepository } = await import('./claude-agent/repository');
      const repositories = await loadRepositories();
      const currentRepo = await getCurrentRepository();
      const reposInfo = repositories.length > 0
        ? `Available repositories for coding sessions (current: ${currentRepo?.name || 'jarvis'}):\n${formatRepositoriesForContext(repositories)}`
        : 'No repositories found.';

      // Get recent conversation history (last 5 exchanges = 10 messages)
      const recentHistory = await conversationHistory.getRecent(10);
      const conversationInfo = recentHistory.length > 0
        ? `Recent conversation:\n${recentHistory.map((msg: any) => 
            `${msg.role === 'user' ? 'User' : 'Jarvis'}: ${msg.content}`
          ).join('\n')}`
        : '';

      // Current time
      const currentTime = new Date().toLocaleString();
      const timeInfo = `Current time: ${currentTime}`;

      const result = await generateText({
        model: groq('meta-llama/llama-4-scout-17b-16e-instruct'),
        system: `You are JARVIS from Iron Man - a sophisticated British AI assistant. Address user as "Sir".
Be professional and slightly witty. Speak naturally like a human - use contractions and casual phrasing.

${timeInfo}
${projectInfo}
${notesInfo}
${micInfo}
${customWordsInfo}
${remindersInfo}
${reposInfo}
${conversationInfo}

CRITICAL: Always respond with a single JSON object (NOT an array). Format:
{"displayText": "text", "speechText": "text", "expectFollowUp": false}

displayText: Can be detailed, with full information.
speechText: Should be natural and conversational, but reasonably concise (2-3 sentences). This is spoken aloud via TTS.

WORKFLOW:
1. If user needs tools (datetime, listTodos, volume, spotify commands, etc), you MUST call them first
2. NEVER claim to have done something without actually calling the tool
3. For volume commands ("set volume to X", "volume to X%", etc), you MUST call the volume tool
4. For coding sessions ("create a session", "open a PR", "build X feature"), use createClaudeSession tool - it automatically creates a git worktree and opens a PR when complete
5. To delete finished sessions ("delete that session", "remove completed sessions"), use deleteClaudeSession tool - only works on completed/errored sessions, not active ones

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
- "what time is it" → Call datetime tool, then {"displayText": "It's 3:56 PM", "speechText": "It's 3:56 PM, Sir", "expectFollowUp": false}
- "set volume to 50%" → Call volume tool with volume=50, then {"displayText": "Volume set to 50%", "speechText": "Volume set to 50%, Sir", "expectFollowUp": false}
- "create a todo to buy milk" → Call addTodo tool, then {"displayText": "Todo created: Buy milk", "speechText": "I've added that to your list, Sir", "expectFollowUp": false}
- "what's on my todo list" → Call listTodos tool, then {"displayText": "Your todos:\n1. Buy milk\n2. Call dentist\n3. Fix bug", "speechText": "You have three items, Sir. Buy milk, call the dentist, and fix a bug", "expectFollowUp": false}
- "remind me to call mom at 3pm" → Call addReminder tool with text="call mom" and scheduledTime="at 3pm" (or ISO format), then {"displayText": "Reminder added: Call mom at 3:00 PM", "speechText": "I've set a reminder to call mom at 3 PM, Sir", "expectFollowUp": false}
- "remind me in 30 minutes to take a break" → Call addReminder tool with text="take a break" and scheduledTime="in 30 minutes", then {"displayText": "Reminder added: Take a break at [calculated time]", "speechText": "I'll remind you to take a break in 30 minutes, Sir", "expectFollowUp": false}
- "show me the code sessions" → Call showOnScreen tool with view="code-sessions", then {"displayText": "Showing code sessions on screen", "speechText": "Switching to the code sessions view, Sir", "expectFollowUp": false}
- "go back to home" → Call showOnScreen tool with view="home", then {"displayText": "Returned to home view", "speechText": "Back to the main dashboard, Sir", "expectFollowUp": false}

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
          updateNotes: updateNotesTool,
          addReminder: addReminderTool,
          listReminders: listRemindersTool,
          deleteReminder: deleteReminderTool,
          spotifyPlay: spotifyPlayTool,
          spotifyPause: spotifyPauseTool,
          spotifyPlayPause: spotifyPlayPauseTool,
          spotifyNext: spotifyNextTool,
          spotifyPrevious: spotifyPreviousTool,
          spotifyCurrentTrack: spotifyCurrentTrackTool,
          spotifyShuffle: spotifyShuffleTool,
          volume: volumeTool,
          setMicrophone: setMicrophoneTool,
          contextDump: contextDumpTool,
          createClaudeSession: createClaudeSessionTool,
          getClaudeSessionStatus: getClaudeSessionStatusTool,
          sendToClaudeSession: sendToClaudeSessionTool,
          listClaudeSessions: listClaudeSessionsTool,
          deleteClaudeSession: deleteClaudeSessionTool,
          showOnScreen: showOnScreenTool
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
    // If we're not in recording status, we've already cancelled - ignore this
    if (this.status !== "recording") {
      return;
    }

    this.updateStatus("processing");
    console.log("🎧 Transcribing...");

    const tempFile = join(process.cwd(), "command.wav");

    try {
      // Check if file exists and has content
      const { stat } = await import('fs/promises');
      try {
        const fileStats = await stat(tempFile);
        if (fileStats.size < 1000) {
          this.updateStatus("listening");
          this.isRecording = false;
          return;
        }
      } catch (fileError) {
        this.updateStatus("listening");
        this.isRecording = false;
        return;
      }

      // Step 1: Transcribe audio using AI SDK
      // Load custom vocabulary (project names, technical terms, etc.)
      const customWords = await memory.getCustomWords();

      // Build vocabulary prompt - use "previous transcript" style to reduce hallucination
      // Whisper works best when the prompt looks like a previous transcription
      // Limit to 10 words to avoid biasing too heavily
      let whisperPrompt = '';
      if (customWords.length > 0) {
        // Format as if it's a previous transcript mentioning these terms naturally
        // This helps Whisper recognize the words without forcing them into the current audio
        const wordList = customWords.map(cw => cw.word).slice(0, 10).join(', ');
        whisperPrompt = `Previous context includes: ${wordList}`;
      }

      const audioBuffer = await readFile(tempFile);
      const transcriptResult = await transcribe({
        model: groq.transcription('whisper-large-v3-turbo'),
        audio: audioBuffer,
        providerOptions: {
          groq: {
            language: 'en',
            temperature: 0.0,  // Most conservative - reduces hallucinations
            ...(whisperPrompt && { prompt: whisperPrompt })
          }
        }
      });

      const transcriptionText = transcriptResult.text;
      console.log(`   💬 "${transcriptionText}"`);
      this.emit({ type: "transcription", data: transcriptionText });

      // Save user message to conversation history
      await conversationHistory.add('user', transcriptionText);

      // Step 2: Generate AI response with tools
      console.log("   🤖 Generating response...");
      const { text: displayText, speechText, expectsFollowUp } = await this.generateResponse(transcriptionText);

      // Save assistant response to conversation history
      await conversationHistory.add('assistant', speechText || displayText);
      this.emit({ type: "response", data: displayText });

      // Step 3: Speak the response via TTS
      // Keep status as "processing" while speaking so wake word can interrupt
      console.log("   🔊 Speaking...");
      try {
        if (speechText && speechText.trim().length > 0) {
          await this.tts.speak(speechText);
          console.log("   ✓ Done");
        }
      } catch (ttsError: any) {
        // Ignore cancellation errors (they're expected when interrupted)
        if (!ttsError.message?.includes("SIGTERM") && !ttsError.message?.includes("killed")) {
          console.error(`   ❌ TTS error: ${ttsError.message}`);
        }
      }

      // Update status after TTS completes (or is cancelled)
      // Only change status if we're still processing (not already interrupted)
      if (this.status === "processing") {
        this.isRecording = false;

        // If follow-up expected, trigger immediate recording
        if (expectsFollowUp) {
          this.updateStatus("recording");
          // Send command to unified script to record immediately
          this.wakeWordDetector?.stdin?.write("RECORD_NOW\n");
        } else {
          this.updateStatus("listening");
        }
      }
      // If status is not "processing", it means we were interrupted and status was already reset
    } catch (error: any) {
      console.error(`❌ Error: ${error?.message || "Unknown error"}`);
      this.emit({ type: "error", data: `${error?.message || "Unknown error"}` });
      this.updateStatus("listening");
      this.isRecording = false;
    }
  }

  private async handleSpeechSegment(wakeWordConfidence: number = 0.0) {
    // Ignore if muted
    if (this.isMuted) {
      return;
    }

    // Always-listening mode handles speech even when in listening state
    if (this.status !== "listening" && this.status !== "transcribing" && this.status !== "intent-checking") {
      // Silently ignore if busy
      return;
    }

    this.updateStatus("transcribing");
    const tempFile = join(process.cwd(), "command.wav");

    try {
      // Check if file exists and has content
      const { stat } = await import('fs/promises');
      try {
        const fileStats = await stat(tempFile);
        if (fileStats.size < 1000) {
          this.updateStatus("listening");
          return;
        }
      } catch (fileError) {
        this.updateStatus("listening");
        return;
      }

      // Step 1: Transcribe audio using Groq Whisper
      console.log("🎧 Transcribing...");
      const customWords = await memory.getCustomWords();

      // Build vocabulary prompt - use "previous transcript" style to reduce hallucination
      let whisperPrompt = '';
      if (customWords.length > 0) {
        // Format as if it's a previous transcript mentioning these terms naturally
        const wordList = customWords.map(cw => cw.word).slice(0, 10).join(', ');
        whisperPrompt = `Previous context includes: ${wordList}`;
      }

      const audioBuffer = await readFile(tempFile);
      const transcriptResult = await transcribe({
        model: groq.transcription('whisper-large-v3-turbo'),
        audio: audioBuffer,
        providerOptions: {
          groq: {
            language: 'en',
            temperature: 0.0,
            ...(whisperPrompt && { prompt: whisperPrompt })
          }
        }
      });

      const transcriptionText = transcriptResult.text;
      console.log(`   💬 "${transcriptionText}"`);
      this.emit({ type: "transcription", data: transcriptionText });

      // Step 2: Intent detection with wake word confidence boost
      this.updateStatus("intent-checking");

      const intentResult = await this.intentDetector.shouldRespond(
        transcriptionText,
        this.lastWakeWordDetected,
        wakeWordConfidence
      );

      // Reset wake word flag after using it
      const wakeWordWasDetected = this.lastWakeWordDetected;
      this.lastWakeWordDetected = false;

      if (!intentResult.shouldRespond) {
        // Background speech - log but don't respond
        console.log(`   🔇 Ignored (intent: ${(intentResult.confidence * 100).toFixed(0)}%, wake: ${(wakeWordConfidence * 100).toFixed(0)}%)`);
        this.emit({ type: "background-speech", data: transcriptionText });
        this.updateStatus("listening");
        return;
      }

      // Intent detected - proceed with response
      console.log(`   ✓ Responding (intent: ${(intentResult.confidence * 100).toFixed(0)}%, wake: ${(wakeWordConfidence * 100).toFixed(0)}%)`);
      this.emit({ type: "intent-detected", data: { transcription: transcriptionText, confidence: intentResult.confidence, wakeWordConfidence } });

      // Save user message to conversation history
      await conversationHistory.add('user', transcriptionText);

      // Step 3: Generate response (same as normal flow)
      this.updateStatus("processing");
      console.log("   🤖 Generating response...");
      const { text: displayText, speechText, expectsFollowUp } = await this.generateResponse(transcriptionText);

      // Save assistant response to conversation history
      await conversationHistory.add('assistant', speechText || displayText);
      this.emit({ type: "response", data: displayText });

      // Step 4: Speak response
      console.log("   🔊 Speaking...");
      try {
        if (speechText && speechText.trim().length > 0) {
          await this.tts.speak(speechText);
          console.log("   ✓ Done");
        }
      } catch (ttsError: any) {
        if (!ttsError.message?.includes("SIGTERM") && !ttsError.message?.includes("killed")) {
          console.error(`   ❌ TTS error: ${ttsError.message}`);
        }
      }

      // Return to listening
      if (this.status === "processing") {
        this.updateStatus("listening");
      }

    } catch (error: any) {
      console.error(`❌ Error: ${error?.message || "Unknown error"}`);
      this.emit({ type: "error", data: `${error?.message || "Unknown error"}` });
      this.updateStatus("listening");
    }
  }

  getStatus(): JarvisStatus {
    return this.status;
  }

  getMuted(): boolean {
    return this.isMuted;
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
    const muteMsg = muted ? "🔇 Microphone muted" : "🔊 Microphone unmuted";
    console.log(muteMsg);
    this.emit({ type: "log", data: muteMsg });
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    const muteMsg = this.isMuted ? "🔇 Microphone muted" : "🔊 Microphone unmuted";
    console.log(muteMsg);
    this.emit({ type: "log", data: muteMsg });
    return this.isMuted;
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

  // Manual activation methods for keyboard mode
  manualActivate() {
    console.log(`🎬 [JarvisEngine] manualActivate() called, current status: ${this.status}`);

    // If currently speaking/processing, cancel speech
    if (this.status === "processing") {
      console.log("⏸️ [JarvisEngine] Interrupting current processing/speech");
      this.emit({ type: "log", data: "Interrupted - stopping speech" });
      this.tts.cancel();
      this.isRecording = false;
      this.updateStatus("listening");
      // Continue to start recording
    }

    // If already recording, ignore
    if (this.status === "recording") {
      console.log("⏭️ [JarvisEngine] Already recording, ignoring activation");
      return;
    }

    // Play activation sound
    spawn("afplay", ["/System/Library/Sounds/Glass.aiff"]);

    // Start recording
    console.log("🔴 [JarvisEngine] Starting recording, updating status to 'recording'");
    this.emit({ type: "log", data: "Manual activation - recording started" });
    this.isRecording = true;
    this.updateStatus("recording");

    // Send command to unified script to start recording
    if (this.wakeWordDetector && this.wakeWordDetector.stdin) {
      console.log("📤 [JarvisEngine] Sending RECORD_NOW to Python script");
      this.emit({ type: "log", data: "Sending RECORD_NOW to Python script" });
      this.wakeWordDetector.stdin.write("RECORD_NOW\n");
    } else {
      console.log("❌ [JarvisEngine] ERROR: wakeWordDetector stdin not available");
      this.emit({ type: "error", data: "Cannot send RECORD_NOW - wakeWordDetector stdin not available" });
    }
  }

  manualDeactivate() {
    console.log(`⏹️ [JarvisEngine] manualDeactivate() called, current status: ${this.status}`);

    // Only deactivate if currently recording
    if (this.status !== "recording") {
      console.log(`⚠️ [JarvisEngine] Cannot deactivate - status is '${this.status}', not 'recording'`);
      this.emit({ type: "log", data: `Cannot deactivate - status is ${this.status}, not recording` });
      return;
    }

    // Send command to unified script to stop recording
    if (this.wakeWordDetector && this.wakeWordDetector.stdin) {
      console.log("📤 [JarvisEngine] Sending STOP_RECORDING to Python script");
      this.emit({ type: "log", data: "Sending STOP_RECORDING to Python script" });
      this.wakeWordDetector.stdin.write("STOP_RECORDING\n");
      console.log("⏳ [JarvisEngine] Waiting for RECORDING_COMPLETE from Python...");
      this.emit({ type: "log", data: "Recording stopped - waiting for RECORDING_COMPLETE from Python..." });
    } else {
      console.log("❌ [JarvisEngine] ERROR: wakeWordDetector stdin not available");
      this.emit({ type: "error", data: "Cannot send STOP_RECORDING - wakeWordDetector stdin not available" });
    }
  }

  // Process text input directly (bypass speech recognition)
  async processTextInput(text: string): Promise<void> {
    console.log(`⌨️  Text input: "${text}"`);
    this.updateStatus("processing");
    this.emit({ type: "transcription", data: text });

    try {
      // Save user message to conversation history
      await conversationHistory.add('user', text);

      // Generate AI response with tools
      console.log("   🤖 Generating response...");
      const { text: displayText, speechText, expectsFollowUp } = await this.generateResponse(text);

      // Save assistant response to conversation history
      await conversationHistory.add('assistant', displayText);

      this.emit({ type: "response", data: displayText });

      // Speak the response
      console.log("   🔊 Speaking...");
      await this.tts.speak(speechText);
      console.log("   ✓ Done");

      // Return to listening state (always listening if that mode is enabled)
      if (this.config.alwaysListening) {
        this.updateStatus("listening");
      } else {
        this.updateStatus(expectsFollowUp ? "listening" : "idle");
      }
    } catch (error: any) {
      console.error(`❌ Error: ${error.message}`);
      this.emit({ type: "error", data: error.message });
      // Return to listening if in always-listening mode, otherwise idle
      this.updateStatus(this.config.alwaysListening ? "listening" : "idle");
    }
  }
}
