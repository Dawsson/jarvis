import { type Tool } from 'ai';
import { z } from 'zod';
import { reminders } from '../memory/reminders';

// Helper function to parse natural language time to Date
function parseTime(timeStr: string): Date | null {
  const now = new Date();
  const lowerTime = timeStr.toLowerCase().trim();
  
  // Handle relative times: "in X minutes", "in X hours"
  const relativeMatch = lowerTime.match(/in\s+(\d+)\s+(minute|minutes|hour|hours|hr|hrs)/);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2].toLowerCase();
    const ms = unit.startsWith('minute') ? amount * 60000 : amount * 3600000;
    return new Date(now.getTime() + ms);
  }
  
  // Handle "in X minutes" (without "s")
  const relativeMatch2 = lowerTime.match(/in\s+(\d+)\s+(min|mins)/);
  if (relativeMatch2) {
    const amount = parseInt(relativeMatch2[1]);
    return new Date(now.getTime() + amount * 60000);
  }
  
  // Handle absolute times: "at 3pm", "at 9am", "at 15:30"
  const timeMatch = lowerTime.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    const ampm = timeMatch[3];
    
    if (ampm) {
      if (ampm === 'pm' && hours !== 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
    }
    
    const target = new Date(now);
    target.setHours(hours, minutes, 0, 0);
    
    // If time has passed today, set for tomorrow
    if (target < now) {
      target.setDate(target.getDate() + 1);
    }
    
    return target;
  }
  
  // Handle ISO format
  if (timeStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
    if (timeStr.endsWith('Z')) {
      // UTC - convert to local
      const utcDate = new Date(timeStr);
      return new Date(utcDate.getTime() - utcDate.getTimezoneOffset() * 60000);
    } else {
      // Local time
      return new Date(timeStr);
    }
  }
  
  // Try JavaScript's Date constructor as fallback
  const parsed = new Date(timeStr);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  
  return null;
}

export const addReminderTool: Tool = {
  description: 'Add a reminder for a specific time. IMPORTANT: Convert natural language times to ISO format (YYYY-MM-DDTHH:MM:SS) in LOCAL timezone before calling. Examples: "at 3pm" → "2025-11-23T15:00:00", "in 30 minutes" → calculate current time + 30 minutes, "tomorrow at 9am" → calculate tomorrow 9am. Always use ISO format WITHOUT Z suffix for local time.',
  inputSchema: z.object({
    text: z.string().describe('The reminder text/message'),
    scheduledTime: z.string().describe('Time in ISO format (YYYY-MM-DDTHH:MM:SS) for local time, or natural language like "in 30 minutes", "at 3pm", "at 15:30". Will be parsed and converted to local time.')
  }),
  execute: async ({ text, scheduledTime }: { text: string; scheduledTime: string }) => {
    try {
      console.log(`[ReminderTool] Parsing time: "${scheduledTime}"`);
      
      let parsedTime: Date | null = parseTime(scheduledTime);
      
      if (!parsedTime || isNaN(parsedTime.getTime())) {
        console.log(`[ReminderTool] Failed to parse: "${scheduledTime}"`);
        return { 
          success: false, 
          message: `Could not parse time: "${scheduledTime}". Please use formats like "in 30 minutes", "at 3pm", "at 15:30", or ISO format "2025-11-23T15:00:00"` 
        };
      }
      
      console.log(`[ReminderTool] Parsed to: ${parsedTime.toISOString()} (local: ${parsedTime.toLocaleString()})`);
      
      // Store as ISO string (this preserves the exact moment in time)
      const reminder = await reminders.add(text, parsedTime.toISOString());
      return {
        success: true,
        reminder: {
          id: reminder.id,
          text: reminder.text,
          scheduledTime: reminder.scheduledTime,
          scheduledTimeFormatted: new Date(reminder.scheduledTime).toLocaleString()
        },
        message: `Reminder added: "${text}" at ${new Date(reminder.scheduledTime).toLocaleString()}`
      };
    } catch (error: any) {
      console.error(`[ReminderTool] Error:`, error);
      return { success: false, message: `Error adding reminder: ${error.message}` };
    }
  }
};

export const listRemindersTool: Tool = {
  description: 'List all active reminders (not completed and not yet due)',
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const activeReminders = await reminders.getActive();
      return {
        success: true,
        reminders: activeReminders.map((r) => ({
          id: r.id,
          text: r.text,
          scheduledTime: r.scheduledTime,
          scheduledTimeFormatted: new Date(r.scheduledTime).toLocaleString()
        })),
        count: activeReminders.length
      };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
};

export const deleteReminderTool: Tool = {
  description: 'Delete a reminder by its ID',
  inputSchema: z.object({
    id: z.string().describe('The reminder ID to delete')
  }),
  execute: async ({ id }: { id: string }) => {
    try {
      const deleted = await reminders.delete(id);
      if (deleted) {
        return { success: true, message: `Reminder deleted` };
      } else {
        return { success: false, message: `Reminder not found` };
      }
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
};
