import { JSONFilePreset } from 'lowdb/node';
import { join, dirname } from 'path';
import { mkdir } from 'fs/promises';

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ConversationHistoryData {
  messages: ConversationMessage[];
}

const defaultData: ConversationHistoryData = {
  messages: []
};

const dbPath = join(process.cwd(), '.memory', 'jarvis-conversation-history.json');
let db: any = null;

async function getDb() {
  if (!db) {
    try {
      // Ensure .memory directory exists
      await mkdir(dirname(dbPath), { recursive: true });
      db = await JSONFilePreset<ConversationHistoryData>(dbPath, defaultData);
      console.log('[ConversationHistory] Database initialized:', dbPath);
    } catch (error) {
      console.error('[ConversationHistory] Failed to initialize database:', error);
      throw error;
    }
  }
  return db;
}

// Keep only last N messages to prevent file from growing too large
const MAX_MESSAGES = 100;

export const conversationHistory = {
  add: async (role: 'user' | 'assistant', content: string): Promise<ConversationMessage> => {
    const database = await getDb();
    
    const message: ConversationMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role,
      content,
      timestamp: new Date().toISOString()
    };
    
    database.data.messages.push(message);
    
    // Keep only last MAX_MESSAGES
    if (database.data.messages.length > MAX_MESSAGES) {
      database.data.messages = database.data.messages.slice(-MAX_MESSAGES);
    }
    
    await database.write();
    return message;
  },

  getRecent: async (count: number = 10): Promise<ConversationMessage[]> => {
    const database = await getDb();
    const messages = database.data.messages || [];
    return messages.slice(-count);
  },

  getAll: async (): Promise<ConversationMessage[]> => {
    const database = await getDb();
    return database.data.messages || [];
  },

  clear: async (): Promise<void> => {
    const database = await getDb();
    database.data.messages = [];
    await database.write();
  }
};
