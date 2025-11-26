/**
 * Shared types for web components
 */

/**
 * Theme colors for the application
 */
export interface Theme {
  bg: string;
  fg: string;
  dim: string;
  accent: string;
  warn: string;
  success: string;
}

/**
 * System statistics
 */
export interface SystemStats {
  cpu: number;
  memory: number;
  uptime: number;
}

/**
 * Todo item
 */
export interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

/**
 * Reminder item
 */
export interface Reminder {
  id: string;
  text: string;
  scheduledTime: number;
}

/**
 * File operation record
 */
export interface FileOperation {
  path: string;
  operation: string;
  timestamp: number;
  toolUseId: string;
  oldContent?: string;
  newContent?: string;
  linesAdded?: number;
  linesRemoved?: number;
}

/**
 * Code review summary statistics
 */
export interface CodeReviewSummary {
  totalFiles: number;
  filesCreated: number;
  filesModified: number;
  filesRead: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  fileOperations: FileOperation[];
}
