import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

export interface SessionMessage {
  type: 'user' | 'assistant' | 'system' | 'result' | 'stream_event';
  timestamp: string;
  content: SDKMessage;
}

export interface JarvisClaudeSession {
  session_id: string;
  created_at: string;
  updated_at: string;
  status: 'active' | 'completed' | 'error';
  task: string;
  cwd: string;
  repository_name?: string; // Name of the repo (e.g., "jarvis", "cookify")
  repository_path?: string; // Full path to the repo
  worktree_path?: string;
  messages: SessionMessage[];
  files_modified: string[];
  files_created: string[];
  files_read: string[];
  error_message?: string;
  jarvis_metadata: {
    voice_command: string;
    voice_results_summary: string;
    pr_url?: string;
  };
}

export interface CreateSessionOptions {
  cwd?: string;
  repositoryName?: string; // Which repo to use for the session
  useWorktree?: boolean;
  worktreeName?: string;
}

export interface RepositoryInfo {
  name: string;
  path: string;
  description?: string;
}
