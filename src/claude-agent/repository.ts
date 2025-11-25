import { readFile } from 'fs/promises';
import { join, basename } from 'path';
import { existsSync } from 'fs';
import type { RepositoryInfo } from './types';

const MEMORY_FILE = join(process.cwd(), '.memory', 'jarvis-memory.json');

interface JarvisMemory {
  projects?: Array<{
    id: string;
    name: string;
    todos: any[];
    createdAt: string;
    repositoryPath?: string;
  }>;
  currentProjectId?: string;
  notes?: any;
  preferredMicrophoneIndex?: number;
  preferredMicrophoneName?: string;
  customWords?: any[];
  availableRepositories?: RepositoryInfo[];
}

/**
 * Discover git repositories in the projects directory
 */
export async function discoverRepositories(): Promise<RepositoryInfo[]> {
  const projectsDir = join(process.env.HOME!, 'projects');
  const repos: RepositoryInfo[] = [];

  try {
    const { readdir } = await import('fs/promises');
    const entries = await readdir(projectsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const repoPath = join(projectsDir, entry.name);
        const gitPath = join(repoPath, '.git');

        if (existsSync(gitPath)) {
          repos.push({
            name: entry.name,
            path: repoPath,
          });
        }
      }
    }
  } catch (error) {
    console.error('Failed to discover repositories:', error);
  }

  return repos.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Load available repositories from memory file
 */
export async function loadRepositories(): Promise<RepositoryInfo[]> {
  try {
    if (!existsSync(MEMORY_FILE)) {
      return await discoverRepositories();
    }

    const content = await readFile(MEMORY_FILE, 'utf-8');
    const memory: JarvisMemory = JSON.parse(content);

    // If we have stored repositories, use those
    if (memory.availableRepositories && memory.availableRepositories.length > 0) {
      return memory.availableRepositories;
    }

    // Otherwise discover them
    const discovered = await discoverRepositories();

    // Save discovered repos to memory
    await saveRepositories(discovered);

    return discovered;
  } catch (error) {
    console.error('Failed to load repositories:', error);
    return [];
  }
}

/**
 * Save repositories to memory file
 */
export async function saveRepositories(repos: RepositoryInfo[]): Promise<void> {
  try {
    let memory: JarvisMemory = {};

    if (existsSync(MEMORY_FILE)) {
      const content = await readFile(MEMORY_FILE, 'utf-8');
      memory = JSON.parse(content);
    }

    memory.availableRepositories = repos;

    const { writeFile } = await import('fs/promises');
    await writeFile(MEMORY_FILE, JSON.stringify(memory, null, 2));
  } catch (error) {
    console.error('Failed to save repositories:', error);
  }
}

/**
 * Get repository by name (case-insensitive)
 */
export async function getRepositoryByName(name: string): Promise<RepositoryInfo | null> {
  const repos = await loadRepositories();
  const normalized = name.toLowerCase().trim();

  return repos.find(r => r.name.toLowerCase() === normalized) || null;
}

/**
 * Get current repository based on Jarvis memory's currentProjectId
 */
export async function getCurrentRepository(): Promise<RepositoryInfo | null> {
  try {
    if (!existsSync(MEMORY_FILE)) {
      // Default to jarvis repo if no memory file
      return {
        name: 'jarvis',
        path: process.cwd(),
      };
    }

    const content = await readFile(MEMORY_FILE, 'utf-8');
    const memory: JarvisMemory = JSON.parse(content);

    // Find the current project
    if (memory.currentProjectId && memory.projects) {
      const currentProject = memory.projects.find(p => p.id === memory.currentProjectId);

      if (currentProject) {
        // If project has a stored repository path, use it
        if (currentProject.repositoryPath) {
          return {
            name: currentProject.name.toLowerCase(),
            path: currentProject.repositoryPath,
          };
        }

        // Otherwise try to find it by name
        const repo = await getRepositoryByName(currentProject.name);
        if (repo) {
          return repo;
        }
      }
    }

    // Default to jarvis
    return {
      name: 'jarvis',
      path: process.cwd(),
    };
  } catch (error) {
    console.error('Failed to get current repository:', error);
    return {
      name: 'jarvis',
      path: process.cwd(),
    };
  }
}

/**
 * Format repository list for context window
 */
export function formatRepositoriesForContext(repos: RepositoryInfo[]): string {
  if (repos.length === 0) {
    return 'No repositories available.';
  }

  return repos.map(r => `- ${r.name}: ${r.path}`).join('\n');
}
