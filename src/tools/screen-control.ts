import { type Tool } from 'ai';
import { z } from 'zod';
import type { ScreenView } from '../types/websocket';

// Callback function type for screen control
type ScreenControlCallback = (view: ScreenView, sessionId?: string) => void;

// This will be set by the daemon when initializing tools
let screenControlCallback: ScreenControlCallback | null = null;

export function setScreenControlCallback(callback: ScreenControlCallback) {
  screenControlCallback = callback;
}

export const showOnScreenTool: Tool = {
  description: 'Control what is displayed on the JARVIS web interface. Use this to show Claude Code sessions, return to home view, or display a split view. Call this when the user asks to see coding sessions, check on Claude, view the dashboard, or go back to home.',
  inputSchema: z.object({
    view: z.enum(['home', 'claude-sessions', 'split']).describe(
      'The view to display: "home" for the main reactor dashboard, "claude-sessions" to show active Claude Code sessions, or "split" to show both side by side'
    ),
    sessionId: z.string().optional().describe(
      'Optional: Focus on a specific session ID when showing claude-sessions view'
    ),
  }),
  execute: async ({ view, sessionId }: { view: ScreenView; sessionId?: string }) => {
    if (!screenControlCallback) {
      return {
        success: false,
        message: 'Screen control is not available. The web interface may not be running.',
      };
    }

    try {
      screenControlCallback(view, sessionId);

      const viewDescriptions: Record<ScreenView, string> = {
        'home': 'the main dashboard',
        'claude-sessions': 'the Claude Code sessions view',
        'split': 'a split view with dashboard and sessions',
      };

      let message = `I've switched the display to ${viewDescriptions[view]}, Sir.`;

      if (sessionId) {
        message = `I've focused on session ${sessionId} in the sessions view, Sir.`;
      }

      return {
        success: true,
        message,
        details: {
          view,
          sessionId,
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to change screen view: ${error.message}`,
        error: error.message,
      };
    }
  }
};

export const getCurrentViewTool: Tool = {
  description: 'Get the current view displayed on the JARVIS web interface.',
  inputSchema: z.object({}),
  execute: async () => {
    // This would need to be populated from state - for now return a placeholder
    return {
      success: true,
      message: 'The current view information has been retrieved.',
      details: {
        currentView: 'home', // This should be populated from actual state
      }
    };
  }
};
