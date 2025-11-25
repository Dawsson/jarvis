import { appendFile, readFile, mkdir, readdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { JarvisClaudeSession, SessionMessage } from './types';

// Store sessions in the project's .memory folder instead of ~/.claude
const SESSIONS_DIR = join(process.cwd(), '.memory', 'claude-sessions');

export async function initSessionStorage() {
  if (!existsSync(SESSIONS_DIR)) {
    await mkdir(SESSIONS_DIR, { recursive: true });
    console.log(`📁 Created sessions directory: ${SESSIONS_DIR}`);
  }
}

export async function appendMessageToSession(
  sessionId: string,
  message: SDKMessage
) {
  const sessionFile = join(SESSIONS_DIR, `${sessionId}.jsonl`);
  const entry = {
    timestamp: new Date().toISOString(),
    message,
  };
  await appendFile(sessionFile, JSON.stringify(entry) + '\n');
}

export async function saveSessionMetadata(session: JarvisClaudeSession) {
  const metadataFile = join(SESSIONS_DIR, `${session.session_id}.meta.json`);
  await appendFile(metadataFile, JSON.stringify(session, null, 2));
}

export async function loadSession(sessionId: string): Promise<JarvisClaudeSession | null> {
  try {
    const metadataFile = join(SESSIONS_DIR, `${sessionId}.meta.json`);
    const content = await readFile(metadataFile, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

export async function loadAllSessions(): Promise<JarvisClaudeSession[]> {
  try {
    await initSessionStorage();
    const files = await readdir(SESSIONS_DIR);
    const metaFiles = files.filter(f => f.endsWith('.meta.json'));

    const sessions: JarvisClaudeSession[] = [];
    for (const file of metaFiles) {
      const sessionId = file.replace('.meta.json', '');
      const session = await loadSession(sessionId);
      if (session) {
        sessions.push(session);
      }
    }

    return sessions.sort((a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  } catch (error) {
    return [];
  }
}

export async function updateSessionMetadata(session: JarvisClaudeSession) {
  const metadataFile = join(SESSIONS_DIR, `${session.session_id}.meta.json`);
  const { writeFile } = await import('fs/promises');
  await writeFile(metadataFile, JSON.stringify(session, null, 2));
}
