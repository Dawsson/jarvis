import { type Tool } from 'ai';
import { z } from 'zod';
import { listMicrophones } from '../list-microphones';
import type { JarvisEngine } from '../jarvis-engine';
import { memory } from '../memory';

// Store a reference to the engine instance so tools can access it
let engineInstance: JarvisEngine | null = null;

export function setEngineInstance(engine: JarvisEngine | null) {
  engineInstance = engine;
}

// Helper function to find the best matching microphone by name
function findBestMicrophone(microphones: Array<{ index: number; name: string }>, searchName: string): { index: number; name: string } | null {
  const normalizedSearch = searchName.toLowerCase().trim();
  
  // First, try exact match (case-insensitive)
  const exactMatch = microphones.find(mic => mic.name.toLowerCase() === normalizedSearch);
  if (exactMatch) return exactMatch;
  
  // Then try contains match
  const containsMatch = microphones.find(mic => 
    mic.name.toLowerCase().includes(normalizedSearch) || 
    normalizedSearch.includes(mic.name.toLowerCase())
  );
  if (containsMatch) return containsMatch;
  
  // Try fuzzy matching - check if search term appears in the name
  const fuzzyMatches = microphones
    .map(mic => {
      const micName = mic.name.toLowerCase();
      // Split search term into words and check if they appear in mic name
      const searchWords = normalizedSearch.split(/\s+/);
      const matchCount = searchWords.filter(word => micName.includes(word)).length;
      return { mic, score: matchCount / searchWords.length };
    })
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score);
  
  if (fuzzyMatches.length > 0) {
    const bestMatch = fuzzyMatches[0];
    if (bestMatch && bestMatch.score >= 0.5) {
      return bestMatch.mic;
    }
  }
  
  return null;
}

export const setMicrophoneTool: Tool = {
  description: 'Change the microphone input device by name (e.g., "airpods", "macbook", "built-in microphone"). Finds the best matching microphone device.',
  inputSchema: z.object({
    name: z.string().describe('Name or partial name of the microphone to use (e.g., "airpods", "macbook", "built-in")')
  }),
  execute: async ({ name }: { name: string }) => {
    try {
      if (!engineInstance) {
        return { 
          success: false, 
          message: 'Engine instance not available. Cannot change microphone.' 
        };
      }

      // List all available microphones
      const microphones = await listMicrophones();
      
      if (microphones.length === 0) {
        return { 
          success: false, 
          message: 'No microphones found on the system.' 
        };
      }

      // Find the best matching microphone
      const matchedMic = findBestMicrophone(microphones, name);
      
      if (!matchedMic) {
        const availableNames = microphones.map(m => m.name).join(', ');
        return { 
          success: false, 
          message: `No microphone found matching "${name}". Available microphones: ${availableNames}`,
          availableMicrophones: microphones.map(m => m.name)
        };
      }

      // Update the microphone on the engine
      await engineInstance.updateMicrophone(matchedMic.index);
      
      // Save to memory as preferred microphone
      await memory.setPreferredMicrophone(matchedMic.index, matchedMic.name);
      
      return { 
        success: true, 
        message: `Microphone changed to "${matchedMic.name}"`,
        microphone: {
          index: matchedMic.index,
          name: matchedMic.name
        }
      };
    } catch (error: any) {
      return { 
        success: false, 
        message: `Failed to change microphone: ${error.message}` 
      };
    }
  }
};
