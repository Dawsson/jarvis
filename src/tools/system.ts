import { type Tool } from 'ai';
import { z } from 'zod';
import os from 'os';

export const systemInfoTool: Tool = {
  description: 'Get system information including CPU, memory, platform, and uptime',
  inputSchema: z.object({}),
  execute: async () => {
    const totalMemGB = Math.round(os.totalmem() / 1024 / 1024 / 1024);
    const freeMemGB = Math.round(os.freemem() / 1024 / 1024 / 1024);
    const usedMemGB = totalMemGB - freeMemGB;
    const memoryUsagePercent = Math.round((usedMemGB / totalMemGB) * 100);

    const uptimeMinutes = Math.round(os.uptime() / 60);
    const uptimeHours = Math.floor(uptimeMinutes / 60);
    const uptimeDays = Math.floor(uptimeHours / 24);

    let uptimeStr = '';
    if (uptimeDays > 0) {
      uptimeStr = `${uptimeDays} day${uptimeDays > 1 ? 's' : ''}`;
    } else if (uptimeHours > 0) {
      uptimeStr = `${uptimeHours} hour${uptimeHours > 1 ? 's' : ''}`;
    } else {
      uptimeStr = `${uptimeMinutes} minute${uptimeMinutes > 1 ? 's' : ''}`;
    }

    return {
      platform: os.platform(),
      arch: os.arch(),
      cpuCores: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || 'Unknown',
      totalMemory: `${totalMemGB} GB`,
      freeMemory: `${freeMemGB} GB`,
      usedMemory: `${usedMemGB} GB`,
      memoryUsage: `${memoryUsagePercent}%`,
      uptime: uptimeStr,
      hostname: os.hostname()
    };
  }
};
