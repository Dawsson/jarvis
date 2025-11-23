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
    throw new Error(error.message || 'Volume command failed');
  }
}

export const volumeTool: Tool = {
  description: 'REQUIRED for any volume change requests. Set MacBook system volume (0-100). Use this tool whenever the user asks to change, set, adjust, increase, decrease, or modify volume. Controls the overall system volume, not Spotify-specific. Example: user says "set volume to 10%" → call this tool with volume=10.',
  inputSchema: z.object({
    volume: z.union([
      z.number().min(0).max(100),
      z.string().transform((val) => {
        const num = parseFloat(val);
        if (isNaN(num)) throw new Error('Volume must be a number');
        return num;
      }).pipe(z.number().min(0).max(100))
    ]).describe('Volume level from 0 to 100 (can be number or string)')
  }),
  execute: async ({ volume }: { volume: number | string }) => {
    try {
      // Convert to number if string
      const volumeNum = typeof volume === 'string' ? parseFloat(volume) : volume;
      
      if (isNaN(volumeNum) || volumeNum < 0 || volumeNum > 100) {
        return { success: false, message: 'Volume must be a number between 0 and 100' };
      }
      
      // macOS volume is 0-100, but AppleScript uses 0-7 scale, so we need to convert
      // Actually, we can use the output volume command which accepts 0-100
      await runAppleScript(`set volume output volume ${Math.round(volumeNum)}`);
      return { success: true, message: `System volume set to ${Math.round(volumeNum)}%` };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
};
