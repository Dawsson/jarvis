import { JSONFilePreset } from 'lowdb/node'
import { join } from 'path'

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

export interface Memory {
  projects: Project[]
  currentProjectId: string | null
  notes: { [key: string]: string }
}

const defaultData: Memory = {
  projects: [],
  currentProjectId: null,
  notes: {}
}

// Initialize database
const dbPath = join(process.cwd(), 'jarvis-memory.json')
let db: any = null;

async function getDb() {
  if (!db) {
    try {
      db = await JSONFilePreset<Memory>(dbPath, defaultData);
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

  // Get all data for AI context
  getContext: async () => {
    const database = await getDb();
    const currentProject = await memory.getCurrentProject()
    const activeTodos = currentProject?.todos.filter((t: Todo) => !t.completed) || []

    return {
      currentProject: currentProject?.name || null,
      activeTodos: activeTodos,
      allProjects: (database.data?.projects || []).map((p: Project) => ({
        name: p.name,
        todoCount: p.todos.filter((t: Todo) => !t.completed).length
      })),
      notes: database.data?.notes || {}
    }
  }
}
