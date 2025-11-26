import { type Tool } from 'ai';
import { z } from 'zod';
import { claudeAgentManager } from '../claude-agent/manager';

export const createClaudeSessionTool: Tool = {
  description: 'Create a new Claude Agent SDK session for coding tasks. ALWAYS creates a git worktree and automatically opens a PR when complete. Use this when the user asks to create a coding session, delegate work to Claude, or start working on a technical task. The repository is automatically selected based on the current project context.',
  inputSchema: z.object({
    task: z.string().describe('The coding task description'),
    repositoryName: z.string().optional().describe('Repository name to use (e.g., "jarvis", "cookify"). Defaults to current project.'),
    cwd: z.string().optional().describe('Working directory (defaults to repository path)'),
    useWorktree: z.string().optional().default("true").describe('Create isolated git worktree (default: true). Set to false to work directly in repo.'),
    worktreeName: z.string().optional().describe('Name for worktree branch'),
  }),
  execute: async ({ task, repositoryName, cwd, useWorktree = "true", worktreeName }) => {
    try {
      const useWorktreeBool = useWorktree === "true" || useWorktree === true;
      const sessionId = await claudeAgentManager.createSession(task, {
        repositoryName,
        cwd,
        useWorktree: useWorktreeBool,
        worktreeName,
      });

      return {
        success: true,
        sessionId,
        message: `I've started the coding session, Sir. Working on: ${task}`,
        details: {
          task,
          repository: repositoryName || 'current project',
          useWorktree: useWorktree || false,
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to create coding session: ${error.message}`,
        error: error.message,
      };
    }
  }
};

export const getClaudeSessionStatusTool: Tool = {
  description: 'Get status and recent activity of a Claude Agent session. Use this when the user asks about the coding session status, progress, or what\'s happening.',
  inputSchema: z.object({
    sessionId: z.string().optional().describe('Session ID (defaults to most recent active)'),
  }),
  execute: async ({ sessionId }) => {
    try {
      const session = await claudeAgentManager.getSession(sessionId);

      if (!session) {
        return {
          success: false,
          message: sessionId
            ? `No session found with ID: ${sessionId}`
            : 'No active coding sessions found, Sir.',
        };
      }

      const fileCount = session.files_modified.length + session.files_created.length;
      let statusMessage = '';

      if (session.status === 'active') {
        statusMessage = `The coding session is in progress, Sir. ${fileCount} file${fileCount !== 1 ? 's' : ''} modified so far.`;
      } else if (session.status === 'completed') {
        statusMessage = `The coding session has completed, Sir. Created ${session.files_created.length} file${session.files_created.length !== 1 ? 's' : ''} and modified ${session.files_modified.length} file${session.files_modified.length !== 1 ? 's' : ''}.`;
        if (session.jarvis_metadata.pr_url) {
          statusMessage += ` A pull request has been created: ${session.jarvis_metadata.pr_url}`;
        }
      } else if (session.status === 'error') {
        statusMessage = `I apologize, Sir. The coding session encountered an error${session.error_message ? ': ' + session.error_message : '.'}`        ;
      }

      return {
        success: true,
        status: session.status,
        message: statusMessage,
        details: {
          sessionId: session.session_id,
          task: session.task,
          repository: session.repository_name,
          filesCreated: session.files_created,
          filesModified: session.files_modified,
          worktreePath: session.worktree_path,
          prUrl: session.jarvis_metadata.pr_url,
          cwd: session.cwd,
          createdAt: session.created_at,
          updatedAt: session.updated_at,
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to get session status: ${error.message}`,
        error: error.message,
      };
    }
  }
};

export const sendToClaudeSessionTool: Tool = {
  description: 'Send additional instructions to an active Claude Agent session. Use this when the user wants to add more requirements or change direction.',
  inputSchema: z.object({
    sessionId: z.string().optional().describe('Session ID (defaults to most recent active)'),
    message: z.string().describe('Message to send to the session'),
  }),
  execute: async ({ sessionId, message }) => {
    try {
      // Get session to verify it exists
      const session = await claudeAgentManager.getSession(sessionId);

      if (!session) {
        return {
          success: false,
          message: sessionId
            ? `No session found with ID: ${sessionId}`
            : 'No active coding sessions found, Sir.',
        };
      }

      if (session.status !== 'active') {
        return {
          success: false,
          message: `Cannot send message to session with status: ${session.status}`,
        };
      }

      const sent = await claudeAgentManager.sendMessage(session.session_id, message);

      if (!sent) {
        return {
          success: false,
          message: 'Failed to send message to session',
        };
      }

      return {
        success: true,
        message: "I've sent your instructions to the coding session, Sir.",
        details: {
          sessionId: session.session_id,
          messageSent: message,
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to send message: ${error.message}`,
        error: error.message,
      };
    }
  }
};

export const listClaudeSessionsTool: Tool = {
  description: 'List all Claude Agent SDK sessions. Use this when the user asks to see their coding sessions or wants an overview.',
  inputSchema: z.object({
    activeOnly: z.coerce.boolean().optional().describe('Show only active sessions (default: true)'),
  }),
  execute: async ({ activeOnly = true }) => {
    try {
      const sessions = await claudeAgentManager.listSessions(activeOnly);

      if (sessions.length === 0) {
        return {
          success: true,
          message: activeOnly
            ? 'You have no active coding sessions, Sir.'
            : 'You have no coding sessions, Sir.',
          sessions: [],
        };
      }

      const sessionList = sessions.map(s => ({
        id: s.session_id,
        task: s.task,
        status: s.status,
        filesModified: s.files_modified.length + s.files_created.length,
        createdAt: s.created_at,
      }));

      return {
        success: true,
        message: `You have ${sessions.length} ${activeOnly ? 'active ' : ''}coding session${sessions.length !== 1 ? 's' : ''}, Sir.`,
        sessions: sessionList,
        total: sessions.length,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to list sessions: ${error.message}`,
        error: error.message,
      };
    }
  }
};

export const deleteClaudeSessionTool: Tool = {
  description: 'Delete a completed or errored Claude Agent SDK session. Use this when the user wants to clean up finished sessions. Cannot delete active sessions.',
  inputSchema: z.object({
    sessionId: z.string().describe('Session ID to delete'),
  }),
  execute: async ({ sessionId }) => {
    try {
      const session = await claudeAgentManager.getSession(sessionId);

      if (!session) {
        return {
          success: false,
          message: `No session found with ID: ${sessionId}`,
        };
      }

      // Don't allow deleting active sessions
      if (session.status === 'active') {
        return {
          success: false,
          message: 'Cannot delete an active session, Sir. Please wait for it to complete or error.',
        };
      }

      await claudeAgentManager.deleteSession(sessionId);

      return {
        success: true,
        message: `Session deleted, Sir. The session for "${session.task}" has been removed.`,
        details: {
          sessionId,
          task: session.task,
          status: session.status,
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to delete session: ${error.message}`,
        error: error.message,
      };
    }
  }
};
