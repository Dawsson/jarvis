import Groq from 'groq-sdk';
import { writeFile } from 'fs/promises';
import { spawn } from 'child_process';
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

  constructor(apiKey: string, voice: GroqVoice = 'Fritz-PlayAI') {
    this.client = new Groq({ apiKey });
    this.voice = voice;
  }

  async speak(text: string, voice?: GroqVoice): Promise<void> {
    const response = await this.client.audio.speech.create({
      model: 'playai-tts',
      voice: voice || this.voice,
      input: text,
      response_format: 'wav'
    });

    // Save to temp file
    const audioPath = join(process.cwd(), 'response.wav');
    const arrayBuffer = await response.arrayBuffer();
    await writeFile(audioPath, Buffer.from(arrayBuffer));

    // Play audio using macOS afplay
    return new Promise<void>((resolve, reject) => {
      const player = spawn('afplay', [audioPath]);

      player.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Audio playback failed with code ${code}`));
        }
      });

      player.on('error', (error) => {
        reject(error);
      });
    });
  }

  setVoice(voice: GroqVoice) {
    this.voice = voice;
  }

  getVoice(): GroqVoice {
    return this.voice;
  }
}
