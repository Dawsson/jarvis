import { type Tool } from 'ai';
import { z } from 'zod';
import { memory } from '../memory';
import { reminders } from '../memory/reminders';

export const contextDumpTool: Tool = {
  description: 'Get a comprehensive dump of all context information including current time, current project, active todos, reminders, preferred microphone, notes, and all projects. Useful for getting a full overview of the current state.',
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const context = await memory.getContext();
      const projects = await memory.getProjects();
      const currentProject = await memory.getCurrentProject();
      const activeReminders = await reminders.getActive();
      const currentTime = new Date().toISOString();
      const currentTimeFormatted = new Date().toLocaleString();
      
      return {
        currentTime: currentTime,
        currentTimeFormatted: currentTimeFormatted,
        currentProject: context.currentProject || 'None',
        activeTodos: context.activeTodos.map((t: any) => ({
          id: t.id,
          text: t.text,
          completed: t.completed
        })),
        activeReminders: activeReminders.map((r: any) => ({
          id: r.id,
          text: r.text,
          scheduledTime: r.scheduledTime,
          scheduledTimeFormatted: new Date(r.scheduledTime).toLocaleString()
        })),
        preferredMicrophone: context.preferredMicrophone || 'Default',
        preferredMicrophoneIndex: context.preferredMicrophoneIndex,
        notes: context.notes || {},
        allProjects: context.allProjects || [],
        projectDetails: currentProject ? {
          name: currentProject.name,
          todos: currentProject.todos.map((t: any) => ({
            id: t.id,
            text: t.text,
            completed: t.completed,
            createdAt: t.createdAt
          })),
          createdAt: currentProject.createdAt
        } : null
      };
    } catch (error: any) {
      return { 
        success: false, 
        message: `Failed to get context: ${error.message}` 
      };
    }
  }
};
