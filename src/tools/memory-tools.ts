import { type Tool } from 'ai';
import { z } from 'zod';
import { memory } from '../memory';

export const createProjectTool: Tool = {
  description: 'Create a new project to organize todos',
  inputSchema: z.object({
    name: z.string().describe('Project name'),
  }),
  execute: async ({ name }: { name: string }) => {
    const project = await memory.createProject(name);
    return `Created project: ${name}`;
  }
};

export const switchProjectTool: Tool = {
  description: 'Switch to a different project by name',
  inputSchema: z.object({
    name: z.string().describe('Project name (partial match works)'),
  }),
  execute: async ({ name }: { name: string }) => {
    const project = await memory.switchProjectByName(name);
    if (!project) return `No project found matching: ${name}`;
    return `Switched to: ${project.name}`;
  },
};

export const listProjectsTool: Tool = {
  description: 'List all projects with their todo counts',
  inputSchema: z.object({}),
  execute: async () => {
    const projects = await memory.getProjects();
    if (projects.length === 0) return "No projects yet";
    const current = await memory.getCurrentProject();
    return projects.map(p => {
      const active = p.todos.filter(t => !t.completed).length;
      const marker = p.id === current?.id ? '→' : ' ';
      return `${marker} ${p.name} (${active} todos)`;
    }).join('\n');
  },
};

export const addTodoTool: Tool = {
  description: 'Add a todo to the current project',
  inputSchema: z.object({
    text: z.string().describe('The todo item text'),
  }),
  execute: async ({ text }: { text: string }) => {
    try {
      await memory.addTodo(text);
      return `Added: "${text}"`;
    } catch (e: any) {
      return e.message;
    }
  }
};

export const listTodosTool: Tool = {
  description: 'List active todos in current project',
  inputSchema: z.object({}),
  execute: async () => {
    const todos = await memory.getActiveTodos();
    const project = await memory.getCurrentProject();
    if (!project) return "No project selected";
    if (todos.length === 0) return `${project.name}: No todos`;
    return todos.map((t, i) => `${i + 1}. ${t.text}`).join('\n');
  },
};

export const completeTodoTool: Tool = {
  description: 'Mark a todo as completed by number',
  inputSchema: z.object({
    number: z.number().describe('Todo number (1, 2, 3...)'),
  }),
  execute: async ({ number }: { number: number }) => {
    const todos = await memory.getActiveTodos();
    const todo = todos[number - 1];
    if (!todo) return `No todo #${number}`;
    await memory.completeTodo(todo.id);
    return `Completed: "${todo.text}"`;
  },
};

export const deleteTodoTool: Tool = {
  description: 'Delete a todo by number',
  inputSchema: z.object({
    number: z.number().describe('Todo number (1, 2, 3...)'),
  }),
  execute: async ({ number }: { number: number }) => {
    const todos = await memory.getActiveTodos();
    const todo = todos[number - 1];
    if (!todo) return `No todo #${number}`;
    await memory.deleteTodo(todo.id);
    return `Deleted: "${todo.text}"`;
  },
};

export const updateNotesTool: Tool = {
  description: 'Update notes - replaces ALL notes. Provide a JSON string with all notes.',
  inputSchema: z.object({
    notesJson: z.string().describe('JSON string of all notes. Example: "{\\"name\\": \\"Dawson\\", \\"location\\": \\"SF\\"}"'),
  }),
  execute: async ({ notesJson }: { notesJson: string }) => {
    const notes = JSON.parse(notesJson);
    await memory.updateNotes(notes);
    const keys = Object.keys(notes);
    return `Updated ${keys.length} notes: ${keys.join(', ')}`;
  },
};