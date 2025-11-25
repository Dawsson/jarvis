import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const execAsync = promisify(exec);

export function generateWorktreeName(task: string): string {
  // Create a safe branch name from the task description
  const safeName = task
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50);

  const timestamp = Date.now().toString().slice(-6);
  return `jarvis/${safeName}-${timestamp}`;
}

export async function createWorktree(
  name: string,
  baseBranch: string = 'main',
  repositoryPath?: string
): Promise<string> {
  try {
    const repoPath = repositoryPath || process.cwd();

    // Ensure the worktrees directory exists (relative to the repository)
    const worktreeBase = join(repoPath, '..', 'jarvis-worktrees');
    const worktreePath = join(worktreeBase, name.replace('jarvis/', ''));

    // Create worktree with new branch
    const gitCommand = `cd "${repoPath}" && git worktree add -b ${name} "${worktreePath}" ${baseBranch}`;
    await execAsync(gitCommand);

    console.log(`✅ Created worktree at: ${worktreePath}`);
    return worktreePath;
  } catch (error: any) {
    console.error(`❌ Failed to create worktree: ${error.message}`);
    throw new Error(`Failed to create worktree: ${error.message}`);
  }
}

export async function cleanupWorktree(path: string) {
  try {
    await execAsync(`git worktree remove ${path} --force`);
    console.log(`🗑️  Removed worktree at: ${path}`);
  } catch (error: any) {
    console.error(`❌ Failed to cleanup worktree: ${error.message}`);
  }
}

export async function listWorktrees(): Promise<string[]> {
  try {
    const { stdout } = await execAsync('git worktree list --porcelain');
    const lines = stdout.split('\n');
    const worktrees: string[] = [];

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        worktrees.push(line.replace('worktree ', ''));
      }
    }

    return worktrees;
  } catch (error) {
    return [];
  }
}
