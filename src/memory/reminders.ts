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
    // Read fresh data before writing
    await database.read();
    
    const reminder: Reminder = {
      id: `reminder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text,
      scheduledTime,
      completed: false,
      createdAt: new Date().toISOString()
    };
    
    database.data.reminders.push(reminder);
    await database.write();
    console.log(`[Reminders] ✅ Added reminder to file: ${text} at ${scheduledTime} (ID: ${reminder.id})`);
    console.log(`[Reminders] File now contains ${database.data.reminders.length} reminder(s)`);
    return reminder;
  },

  getAll: async (): Promise<Reminder[]> => {
    const database = await getDb();
    // Ensure we read fresh data from disk
    await database.read();
    return database.data.reminders || [];
  },

  getActive: async (): Promise<Reminder[]> => {
    const database = await getDb();
    // Ensure we read fresh data from disk
    await database.read();
    const now = new Date();
    return (database.data.reminders || []).filter((r: Reminder) => 
      !r.completed && new Date(r.scheduledTime) > now
    );
  },

  getDue: async (): Promise<Reminder[]> => {
    const database = await getDb();
    // Ensure we read fresh data from disk
    await database.read();
    const now = new Date();
    const allReminders = database.data.reminders || [];
    const dueReminders = allReminders.filter((r: Reminder) => {
      const scheduled = new Date(r.scheduledTime);
      const isDue = !r.completed && scheduled <= now;
      if (!isDue && !r.completed) {
        // Debug: log why reminder isn't due
        console.log(`[Reminders] Reminder "${r.text}" not due: completed=${r.completed}, scheduled=${scheduled.toISOString()}, now=${now.toISOString()}, scheduled<=now=${scheduled <= now}`);
      }
      return isDue;
    });
    console.log(`[Reminders] getDue() found ${dueReminders.length} due reminders out of ${allReminders.length} total`);
    return dueReminders;
  },

  markCompleted: async (id: string): Promise<boolean> => {
    const database = await getDb();
    // Read fresh data before updating
    await database.read();
    const reminder = database.data.reminders.find((r: Reminder) => r.id === id);
    if (reminder) {
      reminder.completed = true;
      await database.write();
      console.log(`[Reminders] ✅ Marked reminder as completed: ${reminder.text} (ID: ${id})`);
      return true;
    }
    return false;
  },

  delete: async (id: string): Promise<boolean> => {
    const database = await getDb();
    // Read fresh data before deleting
    await database.read();
    const initialLength = database.data.reminders.length;
    database.data.reminders = database.data.reminders.filter((r: Reminder) => r.id !== id);
    await database.write();
    const deleted = database.data.reminders.length < initialLength;
    if (deleted) {
      console.log(`[Reminders] ✅ Deleted reminder (ID: ${id}). File now contains ${database.data.reminders.length} reminder(s)`);
    }
    return deleted;
  },

  deleteCompleted: async (): Promise<number> => {
    const database = await getDb();
    // Read fresh data before deleting
    await database.read();
    const initialLength = database.data.reminders.length;
    database.data.reminders = database.data.reminders.filter((r: Reminder) => !r.completed);
    await database.write();
    const deletedCount = initialLength - database.data.reminders.length;
    if (deletedCount > 0) {
      console.log(`[Reminders] ✅ Deleted ${deletedCount} completed reminder(s). File now contains ${database.data.reminders.length} reminder(s)`);
    }
    return deletedCount;
  }
};
