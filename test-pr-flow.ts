import { claudeAgentManager } from './src/claude-agent/manager';

async function testPRFlow() {
  console.log('🧪 Testing PR Creation Flow\n');

  try {
    // Test 1: Create a session with worktree
    console.log('Test 1: Creating a session with worktree...');
    const sessionId = await claudeAgentManager.createSession(
      'Add a simple utility function to format dates',
      {
        repositoryName: 'jarvis',
        useWorktree: true,
      }
    );
    console.log(`✅ Session created: ${sessionId}`);
    console.log('   Using worktree - PR will be created automatically when complete\n');

    // Test 2: Wait for session to complete
    console.log('Test 2: Waiting for session to complete...');
    console.log('   (This may take 10-30 seconds)');

    // Poll for completion
    let completed = false;
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds

    while (!completed && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;

      const session = await claudeAgentManager.getSession(sessionId);
      if (session && session.status !== 'active') {
        completed = true;
        console.log(`\n✅ Session completed with status: ${session.status}`);

        if (session.jarvis_metadata.pr_url) {
          console.log(`✅ PR created: ${session.jarvis_metadata.pr_url}`);
        } else {
          console.log('ℹ️  No PR was created (gh CLI might not be available)');
        }

        console.log(`\nSession details:`);
        console.log(`  Repository: ${session.repository_name}`);
        console.log(`  Worktree: ${session.worktree_path}`);
        console.log(`  Files created: ${session.files_created.length}`);
        console.log(`  Files modified: ${session.files_modified.length}`);
      }
    }

    if (!completed) {
      console.log('\n⚠️  Session is still running after 60 seconds');
      console.log('   Check .memory/claude-sessions/ for session status');
    }

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
  }
}

testPRFlow();
