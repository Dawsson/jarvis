import { appendFile, readFile, mkdir, readdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { JarvisClaudeSession, SessionMessage } from './types';

// Store sessions in the project's .memory folder
const SESSIONS_DIR = join(process.cwd(), '.memory', 'code-sessions');

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

export async function loadSessionMessages(sessionId: string): Promise<SessionMessage[]> {
  try {
    const jsonlFile = join(SESSIONS_DIR, `${sessionId}.jsonl`);
    const content = await readFile(jsonlFile, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.length > 0);

    const messages: SessionMessage[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const sdkMessage = entry.message;

        // Apply the same message type classification logic as in manager.ts
        let messageType: 'user' | 'assistant' | 'system' | 'result' | 'stream_event' = sdkMessage.type as any;

        // If SDK says "user" but it's actually a tool result, classify it as "result"
        if (sdkMessage.type === 'user' && sdkMessage.message?.content) {
          const content = sdkMessage.message.content;
          if (Array.isArray(content) && content.length > 0 && content[0].type === 'tool_result') {
            messageType = 'result';
          }
        }

        messages.push({
          type: messageType,
          timestamp: entry.timestamp,
          content: sdkMessage,
        });
      } catch (parseError) {
        console.error(`Failed to parse JSONL line: ${line}`, parseError);
      }
    }

    return messages;
  } catch (error) {
    console.error(`Failed to load messages for session ${sessionId}:`, error);
    return [];
  }
}

export async function deleteSession(sessionId: string) {
  const { unlink } = await import('fs/promises');
  const metadataFile = join(SESSIONS_DIR, `${sessionId}.meta.json`);
  const jsonlFile = join(SESSIONS_DIR, `${sessionId}.jsonl`);

  try {
    // Delete both files
    await unlink(metadataFile);
    await unlink(jsonlFile);
    console.log(`🗑️  Deleted session files for ${sessionId}`);
  } catch (error: any) {
    console.error(`Failed to delete session files: ${error.message}`);
    throw error;
  }
}
