import { JSONFilePreset } from 'lowdb/node';
import { join, dirname } from 'path';
import { mkdir } from 'fs/promises';

export interface CommonWord {
  id: string;
  word: string;
  phonetic?: string;
  context?: string;
}

export interface CommonWordsData {
  words: CommonWord[];
}

const defaultData: CommonWordsData = {
  words: []
};

const dbPath = join(process.cwd(), '.memory', 'common-words.json');
let db: any = null;

async function getDb() {
  if (!db) {
    try {
      // Ensure .memory directory exists
      await mkdir(dirname(dbPath), { recursive: true });
      db = await JSONFilePreset<CommonWordsData>(dbPath, defaultData);
      console.log('[CommonWords] Database initialized:', dbPath);
    } catch (error) {
      console.error('[CommonWords] Failed to initialize database:', error);
      throw error;
    }
  }
  return db;
}

export const commonWords = {
  getAll: async (): Promise<CommonWord[]> => {
    const database = await getDb();
    return database.data.words || [];
  },

  add: async (word: string, phonetic?: string, context?: string): Promise<CommonWord> => {
    const database = await getDb();
    const commonWord: CommonWord = {
      id: `common-${Date.now()}`,
      word,
      phonetic,
      context
    };
    database.data.words.push(commonWord);
    await database.write();
    console.log(`[CommonWords] Added: ${word}${phonetic ? ` (phonetic: ${phonetic})` : ''}`);
    return commonWord;
  },

  delete: async (id: string): Promise<boolean> => {
    const database = await getDb();
    const initialLength = database.data.words.length;
    database.data.words = database.data.words.filter((w: CommonWord) => w.id !== id);
    await database.write();
    return database.data.words.length < initialLength;
  }
};
