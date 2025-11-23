import { JSONFilePreset } from 'lowdb/node';
import { join, dirname } from 'path';
import { mkdir } from 'fs/promises';

export interface Reminder {
  id: string;
  text: string;
  scheduledTime: string; // ISO timestamp
  completed: boolean;
  createdAt: string;
}

export interface RemindersData {
  reminders: Reminder[];
}

const defaultData: RemindersData = {
  reminders: []
};

const dbPath = join(process.cwd(), '.memory', 'reminders.json');
let db: any = null;

async function getDb() {
  if (!db) {
    try {
      // Ensure .memory directory exists
      await mkdir(dirname(dbPath), { recursive: true });
      db = await JSONFilePreset<RemindersData>(dbPath, defaultData);
      console.log('[Reminders] Database initialized:', dbPath);
    } catch (error) {
      console.error('[Reminders] Failed to initialize database:', error);
      throw error;
    }
  }
  return db;
}

export const reminders = {
  add: async (text: string, scheduledTime: string): Promise<Reminder> => {
    const database = await getDb();
    
    const reminder: Reminder = {
      id: `reminder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text,
      scheduledTime,
      completed: false,
      createdAt: new Date().toISOString()
    };
    
    database.data.reminders.push(reminder);
    await database.write();
    console.log(`[Reminders] Added reminder: ${text} at ${scheduledTime}`);
    return reminder;
  },

  getAll: async (): Promise<Reminder[]> => {
    const database = await getDb();
    return database.data.reminders || [];
  },

  getActive: async (): Promise<Reminder[]> => {
    const database = await getDb();
    const now = new Date();
    return (database.data.reminders || []).filter((r: Reminder) => 
      !r.completed && new Date(r.scheduledTime) > now
    );
  },

  getDue: async (): Promise<Reminder[]> => {
    const database = await getDb();
    const now = new Date();
    return (database.data.reminders || []).filter((r: Reminder) => 
      !r.completed && new Date(r.scheduledTime) <= now
    );
  },

  markCompleted: async (id: string): Promise<boolean> => {
    const database = await getDb();
    const reminder = database.data.reminders.find((r: Reminder) => r.id === id);
    if (reminder) {
      reminder.completed = true;
      await database.write();
      return true;
    }
    return false;
  },

  delete: async (id: string): Promise<boolean> => {
    const database = await getDb();
    const initialLength = database.data.reminders.length;
    database.data.reminders = database.data.reminders.filter((r: Reminder) => r.id !== id);
    await database.write();
    return database.data.reminders.length < initialLength;
  },

  deleteCompleted: async (): Promise<number> => {
    const database = await getDb();
    const initialLength = database.data.reminders.length;
    database.data.reminders = database.data.reminders.filter((r: Reminder) => !r.completed);
    await database.write();
    return initialLength - database.data.reminders.length;
  }
};
