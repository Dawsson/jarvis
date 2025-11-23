import Groq from 'groq-sdk';
import { writeFile } from 'fs/promises';
import { spawn, type ChildProcess } from 'child_process';
import { join } from 'path';

export type GroqVoice =
  | 'Fritz-PlayAI'
  | 'Atlas-PlayAI'
  | 'Thunder-PlayAI'
  | 'Celeste-PlayAI'
  | 'Arista-PlayAI'
  | 'Basil-PlayAI'
  | 'Briggs-PlayAI'
  | 'Calum-PlayAI'
  | 'Cheyenne-PlayAI'
  | 'Chip-PlayAI'
  | 'Cillian-PlayAI'
  | 'Deedee-PlayAI'
  | 'Gail-PlayAI'
  | 'Indigo-PlayAI'
  | 'Mamaw-PlayAI'
  | 'Mason-PlayAI'
  | 'Mikail-PlayAI'
  | 'Mitch-PlayAI'
  | 'Quinn-PlayAI';

export class TextToSpeech {
  private client: Groq;
  private voice: GroqVoice;
  private currentPlayer: ChildProcess | null = null;
  private isCancelled = false;

  constructor(apiKey: string, voice: GroqVoice = 'Fritz-PlayAI') {
    this.client = new Groq({ apiKey });
    this.voice = voice;
  }

  async speak(text: string, voice?: GroqVoice): Promise<void> {
    // Cancel any ongoing speech
    this.cancel();

    // Reset cancellation flag
    this.isCancelled = false;

    // Clean text for consistent TTS
    const cleanedText = text
      .replace(/\*\*/g, '') // Remove markdown bold
      .replace(/\*/g, '')   // Remove markdown italics
      .replace(/`/g, '')    // Remove code backticks
      .replace(/\n+/g, '. ') // Replace newlines with periods
      .trim();

    const response = await this.client.audio.speech.create({
      model: 'playai-tts',
      voice: voice || this.voice,
      input: cleanedText,
      response_format: 'wav',
      speed: 1.6
    });

    // Check if cancelled during API call
    if (this.isCancelled) {
      return;
    }

    // Save to temp file
    const audioPath = join(process.cwd(), 'response.wav');
    const arrayBuffer = await response.arrayBuffer();
    await writeFile(audioPath, Buffer.from(arrayBuffer));

    // Check if cancelled during file write
    if (this.isCancelled) {
      return;
    }

    // Play audio using macOS afplay
    return new Promise<void>((resolve, reject) => {
      this.currentPlayer = spawn('afplay', [audioPath]);

      this.currentPlayer.on('close', (code) => {
        this.currentPlayer = null;
        if (this.isCancelled) {
          // If cancelled, resolve silently
          resolve();
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Audio playback failed with code ${code}`));
        }
      });

      this.currentPlayer.on('error', (error) => {
        this.currentPlayer = null;
        reject(error);
      });
    });
  }

  cancel() {
    this.isCancelled = true;
    if (this.currentPlayer) {
      this.currentPlayer.kill();
      this.currentPlayer = null;
    }
  }

  setVoice(voice: GroqVoice) {
    this.voice = voice;
  }

  getVoice(): GroqVoice {
    return this.voice;
  }
}
