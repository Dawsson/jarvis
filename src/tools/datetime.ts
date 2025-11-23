import { type Tool } from 'ai';
import { z } from 'zod';

export const datetimeTool: Tool = {
  description: 'Get current time, date, and timezone information',
  inputSchema: z.object({
    timezone: z.string().optional().describe('Timezone (e.g., "America/New_York", defaults to local)')
  }),
  execute: async ({ timezone }: { timezone?: string }) => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = timezone ? { timeZone: timezone } : {};

    return {
      time: now.toLocaleTimeString('en-US', { ...options, hour12: true }),
      date: now.toLocaleDateString('en-US', options),
      iso: now.toISOString(),
      timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      dayOfWeek: now.toLocaleDateString('en-US', { ...options, weekday: 'long' })
    };
  }
};
