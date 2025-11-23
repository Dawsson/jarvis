import { type Tool } from 'ai';
import { z } from 'zod';
import { reminders } from '../memory/reminders';

export const addReminderTool: Tool = {
  description: 'Add a reminder for a specific time. The user will be reminded via voice when the scheduled time arrives. Parse natural language times like "in 30 minutes", "at 3pm", "tomorrow at 9am", etc.',
  inputSchema: z.object({
    text: z.string().describe('The reminder text/message'),
    scheduledTime: z.string().describe('ISO timestamp (e.g., "2024-01-15T14:30:00Z") or natural language time that will be parsed')
  }),
  execute: async ({ text, scheduledTime }: { text: string; scheduledTime: string }) => {
    try {
      // Try to parse the scheduledTime - if it's not ISO, try to parse it
      let parsedTime: Date;
      
      // Check if it's already an ISO string
      if (scheduledTime.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
        parsedTime = new Date(scheduledTime);
      } else {
        // Try to parse as natural language (basic parsing)
        // This is a simple implementation - you might want to use a library like chrono-node
        parsedTime = new Date(scheduledTime);
      }
      
      if (isNaN(parsedTime.getTime())) {
        return { success: false, message: `Invalid time format: ${scheduledTime}. Please use ISO format (e.g., "2024-01-15T14:30:00Z")` };
      }
      
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
      return { success: false, message: error.message };
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
