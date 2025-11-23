import { JSONFilePreset } from 'lowdb/node'
import { join, dirname } from 'path'
import { mkdir } from 'fs/promises'

export interface Todo {
  id: string
  text: string
  completed: boolean
  createdAt: string
}

export interface Project {
  id: string
  name: string
  todos: Todo[]
  createdAt: string
}

export interface CustomWord {
  id: string
  word: string
  phonetic?: string
  context?: string
  createdAt: string
}

export interface Memory {
  projects: Project[]
  currentProjectId: string | null
  notes: { [key: string]: string }
  preferredMicrophoneIndex: number | null
  preferredMicrophoneName: string | null
  customWords: CustomWord[]
}

const defaultData: Memory = {
  projects: [],
  currentProjectId: null,
  notes: {},
  preferredMicrophoneIndex: null,
  preferredMicrophoneName: null,
  customWords: []
}

// Initialize database
const dbPath = join(process.cwd(), '.memory', 'jarvis-memory.json')
let db: any = null;

async function getDb() {
  if (!db) {
    try {
      // Ensure .memory directory exists
      await mkdir(dirname(dbPath), { recursive: true });
      db = await JSONFilePreset<Memory>(dbPath, defaultData);
      
      // Ensure customWords field exists (for backward compatibility)
      if (!db.data.customWords) {
        db.data.customWords = [];
        await db.write();
      }
      
      console.log('[Memory] Database initialized:', dbPath);
    } catch (error) {
      console.error('[Memory] Failed to initialize database:', error);
      throw error;
    }
  }
  return db;
}

// Memory helpers
export const memory = {
  // Projects
  createProject: async (name: string) => {
    try {
      const database = await getDb();
      console.log('[Memory] Creating project:', name);
      console.log('[Memory] DB before:', JSON.stringify(database.data));

      const project: Project = {
        id: Date.now().toString(),
        name,
        todos: [],
        createdAt: new Date().toISOString()
      }
      database.data.projects.push(project)

      // Auto-select if first project
      if (database.data.projects.length === 1) {
        database.data.currentProjectId = project.id
      }

      await database.write()
      console.log('[Memory] DB after write:', JSON.stringify(database.data));
      console.log('[Memory] Project created successfully');
      return project
    } catch (error) {
      console.error('[Memory] Error creating project:', error);
      throw error;
    }
  },

  getProjects: async () => {
    const database = await getDb();
    return database.data.projects;
  },

  getCurrentProject: async () => {
    const database = await getDb();
    if (!database.data.currentProjectId) return null
    return database.data.projects.find((p: Project) => p.id === database.data.currentProjectId) || null
  },

  switchProject: async (projectId: string) => {
    const database = await getDb();
    const project = database.data.projects.find((p: Project) => p.id === projectId)
    if (project) {
      database.data.currentProjectId = projectId
      await database.write()
      return project
    }
    return null
  },

  switchProjectByName: async (name: string) => {
    const database = await getDb();
    const project = database.data.projects.find((p: Project) =>
      p.name.toLowerCase().includes(name.toLowerCase())
    )
    if (project) {
      database.data.currentProjectId = project.id
      await database.write()
      return project
    }
    return null
  },

  deleteProject: async (projectId: string) => {
    const database = await getDb();
    database.data.projects = database.data.projects.filter((p: Project) => p.id !== projectId)
    if (database.data.currentProjectId === projectId) {
      database.data.currentProjectId = database.data.projects[0]?.id || null
    }
    await database.write()
  },

  // Todos (for current project)
  addTodo: async (text: string) => {
    const database = await getDb();
    const project = await memory.getCurrentProject()
    if (!project) {
      throw new Error('No project selected. Create a project first.')
    }

    const todo: Todo = {
      id: Date.now().toString(),
      text,
      completed: false,
      createdAt: new Date().toISOString()
    }

    project.todos.push(todo)
    await database.write()
    return todo
  },

  completeTodo: async (id: string) => {
    const database = await getDb();
    const project = await memory.getCurrentProject()
    if (!project) return null

    const todo = project.todos.find((t: Todo) => t.id === id)
    if (todo) {
      todo.completed = true
      await database.write()
    }
    return todo
  },

  deleteTodo: async (id: string) => {
    const database = await getDb();
    const project = await memory.getCurrentProject()
    if (!project) return

    project.todos = project.todos.filter((t: Todo) => t.id !== id)
    await database.write()
  },

  getActiveTodos: async () => {
    const project = await memory.getCurrentProject()
    if (!project) return []
    return project.todos.filter((t: Todo) => !t.completed)
  },

  // Notes
  updateNotes: async (notes: { [key: string]: string }) => {
    const database = await getDb();
    database.data.notes = notes
    await database.write()
  },

  getNotes: async () => {
    const database = await getDb();
    return database.data.notes;
  },

  // Microphone preferences
  setPreferredMicrophone: async (index: number | null, name: string | null) => {
    const database = await getDb();
    database.data.preferredMicrophoneIndex = index;
    database.data.preferredMicrophoneName = name;
    await database.write();
    console.log(`[Memory] Preferred microphone set to: ${name || 'default'} (index: ${index})`);
  },

  getPreferredMicrophone: async () => {
    const database = await getDb();
    return {
      index: database.data.preferredMicrophoneIndex ?? null,
      name: database.data.preferredMicrophoneName ?? null
    };
  },

  // Custom words for speech recognition
  addCustomWord: async (word: string, phonetic?: string, context?: string) => {
    const database = await getDb();
    
    // Ensure customWords array exists
    if (!database.data.customWords) {
      database.data.customWords = [];
    }
    
    const customWord: CustomWord = {
      id: Date.now().toString(),
      word,
      phonetic,
      context,
      createdAt: new Date().toISOString()
    };
    database.data.customWords.push(customWord);
    await database.write();
    console.log(`[Memory] Added custom word: ${word}${phonetic ? ` (phonetic: ${phonetic})` : ''}`);
    return customWord;
  },

  getCustomWords: async () => {
    const database = await getDb();
    return database.data.customWords || [];
  },

  updateCustomWord: async (id: string, updates: Partial<Omit<CustomWord, 'id' | 'createdAt'>>) => {
    const database = await getDb();
    const customWord = database.data.customWords.find((cw: CustomWord) => cw.id === id);
    if (customWord) {
      Object.assign(customWord, updates);
      await database.write();
      return customWord;
    }
    return null;
  },

  deleteCustomWord: async (id: string) => {
    const database = await getDb();
    database.data.customWords = database.data.customWords.filter((cw: CustomWord) => cw.id !== id);
    await database.write();
  },

  // Get all data for AI context
  getContext: async () => {
    const database = await getDb();
    const currentProject = await memory.getCurrentProject()
    const activeTodos = currentProject?.todos.filter((t: Todo) => !t.completed) || []

    const preferredMic = await memory.getPreferredMicrophone();
    const customWords = database.data?.customWords || [];
    
    return {
      currentProject: currentProject?.name || null,
      activeTodos: activeTodos,
      allProjects: (database.data?.projects || []).map((p: Project) => ({
        name: p.name,
        todoCount: p.todos.filter((t: Todo) => !t.completed).length
      })),
      notes: database.data?.notes || {},
      preferredMicrophone: preferredMic.name || null,
      preferredMicrophoneIndex: preferredMic.index,
      customWords: customWords.map((cw: CustomWord) => ({
        word: cw.word,
        phonetic: cw.phonetic,
        context: cw.context
      }))
    }
  }
}
