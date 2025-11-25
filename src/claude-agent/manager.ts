import { query, type Query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { JarvisClaudeSession, CreateSessionOptions, SessionMessage } from './types';
import {
  initSessionStorage,
  appendMessageToSession,
  saveSessionMetadata,
  loadSession,
  loadAllSessions,
  updateSessionMetadata
} from './session-storage';
import { createWorktree, generateWorktreeName } from './worktree';
import { getCurrentRepository, getRepositoryByName } from './repository';
import { autoCreatePR } from './pr-utils';
import { randomBytes } from 'crypto';

// Event types for real-time updates
export type SessionEventType = 'session-created' | 'session-updated' | 'session-completed' | 'session-error' | 'session-message';

export interface SessionEvent {
  type: SessionEventType;
  sessionId: string;
  session?: JarvisClaudeSession;
  message?: SessionMessage;
}

type SessionEventHandler = (event: SessionEvent) => void;

class ClaudeAgentManager {
  private sessions: Map<string, JarvisClaudeSession> = new Map();
  private activeStreams: Map<string, Query> = new Map();
  private initialized = false;
  private eventHandlers: Set<SessionEventHandler> = new Set();

  // Subscribe to session events
  onSessionEvent(handler: SessionEventHandler) {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  // Emit session events
  private emitEvent(event: SessionEvent) {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in session event handler:', error);
      }
    }
  }

  async init() {
    if (this.initialized) return;

    await initSessionStorage();

    // Load existing sessions from disk
    const savedSessions = await loadAllSessions();
    for (const session of savedSessions) {
      this.sessions.set(session.session_id, session);
    }

    this.initialized = true;
    console.log(`📦 Loaded ${savedSessions.length} existing sessions`);
  }

  private generateSessionId(): string {
    return `jarvis-${Date.now()}-${randomBytes(4).toString('hex')}`;
  }

  async createSession(task: string, options: CreateSessionOptions = {}): Promise<string> {
    await this.init();

    const sessionId = this.generateSessionId();

    // Determine which repository to use
    let repository = null;
    if (options.repositoryName) {
      repository = await getRepositoryByName(options.repositoryName);
      if (!repository) {
        console.warn(`Repository "${options.repositoryName}" not found, using current repository`);
      }
    }

    if (!repository) {
      repository = await getCurrentRepository();
    }

    let cwd = options.cwd || repository?.path || process.cwd();
    let worktreePath: string | undefined;

    // Create worktree if requested
    if (options.useWorktree) {
      const branchName = options.worktreeName || generateWorktreeName(task);
      try {
        worktreePath = await createWorktree(branchName, 'main', repository?.path);
        cwd = worktreePath;
      } catch (error: any) {
        console.error(`Warning: Failed to create worktree, using current directory: ${error.message}`);
      }
    }

    const session: JarvisClaudeSession = {
      session_id: sessionId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'active',
      repository_name: repository?.name,
      repository_path: repository?.path,
      task,
      cwd,
      worktree_path: worktreePath,
      messages: [],
      files_modified: [],
      files_created: [],
      files_read: [],
      jarvis_metadata: {
        voice_command: task,
        voice_results_summary: '',
      },
    };

    this.sessions.set(sessionId, session);
    await saveSessionMetadata(session);

    // Emit session created event
    this.emitEvent({
      type: 'session-created',
      sessionId,
      session,
    });

    // Start streaming in background
    this.startSessionStream(sessionId, task, cwd);

    console.log(`🚀 Created session ${sessionId} for task: ${task}`);
    return sessionId;
  }

  private startSessionStream(sessionId: string, prompt: string, cwd: string) {
    const stream = query({
      prompt,
      options: {
        cwd,
        permissionMode: 'acceptEdits', // Auto-accept edits for voice-commanded sessions
        model: 'claude-sonnet-4-5-20250929',
      },
    });

    this.activeStreams.set(sessionId, stream);

    // Process stream asynchronously (non-blocking)
    (async () => {
      try {
        for await (const message of stream) {
          await this.handleMessage(sessionId, message);
        }

        // Mark session complete
        await this.updateSessionStatus(sessionId, 'completed');
        console.log(`✅ Session ${sessionId} completed successfully`);

        // Auto-create PR if using worktree
        const session = this.sessions.get(sessionId);
        if (session && session.worktree_path) {
          console.log(`🔄 Creating PR for session ${sessionId}...`);
          const prUrl = await autoCreatePR(session);
          if (prUrl) {
            session.jarvis_metadata.pr_url = prUrl;
            await updateSessionMetadata(session);
            console.log(`✅ PR created: ${prUrl}`);
          }
        }
      } catch (error: any) {
        console.error(`❌ Session ${sessionId} error:`, error);
        await this.updateSessionStatus(sessionId, 'error', error.message);
      } finally {
        this.activeStreams.delete(sessionId);
      }
    })();
  }

  private async handleMessage(sessionId: string, message: SDKMessage) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Save message to JSONL
    await appendMessageToSession(sessionId, message);

    // Track message in session
    const sessionMessage: SessionMessage = {
      type: message.type as any,
      timestamp: new Date().toISOString(),
      content: message,
    };
    session.messages.push(sessionMessage);

    // Track file operations from tool results
    if (message.type === 'result') {
      this.trackFileOperations(session, message);
    }

    session.updated_at = new Date().toISOString();
    await updateSessionMetadata(session);

    // Emit session message event for real-time updates
    this.emitEvent({
      type: 'session-message',
      sessionId,
      session,
      message: sessionMessage,
    });
  }

  private trackFileOperations(session: JarvisClaudeSession, message: any) {
    // TODO: Parse tool results to extract file operations
    // This is a simplified version - enhance based on actual message structure
    try {
      const result = message.result;
      if (result && typeof result === 'string') {
        // Look for file modification patterns
        if (result.includes('created') || result.includes('wrote')) {
          // Extract file paths (simplified)
          const fileMatch = result.match(/['"`]([^'"`]+\.[a-z]+)['"`]/i);
          if (fileMatch && fileMatch[1]) {
            session.files_created.push(fileMatch[1]);
          }
        }
        if (result.includes('modified') || result.includes('edited')) {
          const fileMatch = result.match(/['"`]([^'"`]+\.[a-z]+)['"`]/i);
          if (fileMatch && fileMatch[1]) {
            session.files_modified.push(fileMatch[1]);
          }
        }
      }
    } catch (error) {
      // Ignore parsing errors
    }
  }

  private async updateSessionStatus(sessionId: string, status: 'active' | 'completed' | 'error', errorMessage?: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = status;
    session.updated_at = new Date().toISOString();

    if (errorMessage) {
      session.error_message = errorMessage;
    }

    // Generate voice summary
    if (status === 'completed') {
      session.jarvis_metadata.voice_results_summary = this.generateVoiceSummary(session);
    }

    await updateSessionMetadata(session);

    // Emit appropriate event based on status
    const eventType: SessionEventType = status === 'completed'
      ? 'session-completed'
      : status === 'error'
        ? 'session-error'
        : 'session-updated';

    this.emitEvent({
      type: eventType,
      sessionId,
      session,
    });
  }

  private generateVoiceSummary(session: JarvisClaudeSession): string {
    const fileCount = session.files_modified.length + session.files_created.length;

    if (session.status === 'completed') {
      return `Completed the coding session. Created ${session.files_created.length} files and modified ${session.files_modified.length} files.`;
    } else if (session.status === 'error') {
      return `The coding session encountered an error: ${session.error_message || 'Unknown error'}`;
    } else {
      return `The coding session is in progress. ${fileCount} files have been modified so far.`;
    }
  }

  async getSession(sessionId?: string): Promise<JarvisClaudeSession | null> {
    await this.init();

    if (!sessionId) {
      // Return most recent active session
      const sessions = Array.from(this.sessions.values())
        .filter(s => s.status === 'active')
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

      return sessions[0] || null;
    }

    return this.sessions.get(sessionId) || null;
  }

  async listSessions(activeOnly: boolean = true): Promise<JarvisClaudeSession[]> {
    await this.init();

    let sessions = Array.from(this.sessions.values());

    if (activeOnly) {
      sessions = sessions.filter(s => s.status === 'active');
    }

    return sessions.sort((a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }

  async sendMessage(sessionId: string, message: string): Promise<boolean> {
    const stream = this.activeStreams.get(sessionId);
    if (!stream) {
      return false; // Session not active
    }

    // TODO: Implement message sending to active stream
    // This depends on Agent SDK's streaming message API
    console.log(`📨 Sending message to session ${sessionId}: ${message}`);
    return true;
  }
}

// Singleton instance
export const claudeAgentManager = new ClaudeAgentManager();
