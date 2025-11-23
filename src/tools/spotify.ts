import { type Tool } from 'ai';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Helper to run AppleScript commands
async function runAppleScript(script: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`osascript -e '${script}'`);
    return stdout.trim();
  } catch (error: any) {
    throw new Error(error.message || 'Spotify command failed');
  }
}

export const spotifyPlayTool: Tool = {
  description: 'Resume or start playback on Spotify desktop app',
  inputSchema: z.object({}),
  execute: async () => {
    try {
      await runAppleScript('tell application "Spotify" to play');
      return { success: true, message: 'Playback started' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
};

export const spotifyPauseTool: Tool = {
  description: 'Pause Spotify desktop app playback',
  inputSchema: z.object({}),
  execute: async () => {
    try {
      await runAppleScript('tell application "Spotify" to pause');
      return { success: true, message: 'Playback paused' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
};

export const spotifyPlayPauseTool: Tool = {
  description: 'Toggle play/pause on Spotify desktop app',
  inputSchema: z.object({}),
  execute: async () => {
    try {
      await runAppleScript('tell application "Spotify" to playpause');
      return { success: true, message: 'Toggled playback' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
};

export const spotifyNextTool: Tool = {
  description: 'Skip to next track on Spotify desktop app',
  inputSchema: z.object({}),
  execute: async () => {
    try {
      await runAppleScript('tell application "Spotify" to next track');
      return { success: true, message: 'Skipped to next track' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
};

export const spotifyPreviousTool: Tool = {
  description: 'Skip to previous track on Spotify desktop app',
  inputSchema: z.object({}),
  execute: async () => {
    try {
      await runAppleScript('tell application "Spotify" to previous track');
      return { success: true, message: 'Skipped to previous track' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
};

export const spotifyCurrentTrackTool: Tool = {
  description: 'Get currently playing track on Spotify desktop app',
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const script = `
        tell application "Spotify"
          set trackName to name of current track
          set artistName to artist of current track
          set albumName to album of current track
          set playerState to player state as string
          set trackDuration to duration of current track
          set trackPosition to player position
          return trackName & " | " & artistName & " | " & albumName & " | " & playerState & " | " & trackDuration & " | " & trackPosition
        end tell
      `;

      const result = await runAppleScript(script);
      const [track, artist, album, state, duration, position] = result.split(' | ');

      return {
        playing: state === 'playing',
        track,
        artist,
        album,
        progress: Math.floor(parseFloat(position)),
        duration: Math.floor(parseFloat(duration) / 1000)
      };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
};

export const spotifyShuffleTool: Tool = {
  description: 'Toggle shuffle mode on Spotify desktop app',
  inputSchema: z.object({
    state: z.boolean().describe('True to enable shuffle, false to disable')
  }),
  execute: async ({ state }: { state: boolean }) => {
    try {
      await runAppleScript(`tell application "Spotify" to set shuffling to ${state}`);
      return { success: true, message: `Shuffle ${state ? 'enabled' : 'disabled'}` };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
};

