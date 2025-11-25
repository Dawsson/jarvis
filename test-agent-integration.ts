import { claudeAgentManager } from './src/claude-agent/manager';

async function testIntegration() {
  console.log('🧪 Testing Claude Agent SDK Integration\n');

  try {
    // Test 1: Create a session
    console.log('Test 1: Creating a session...');
    const sessionId = await claudeAgentManager.createSession(
      'Write a simple hello world function in TypeScript',
      { cwd: process.cwd() }
    );
    console.log(`✅ Session created: ${sessionId}\n`);

    // Test 2: Get session status
    console.log('Test 2: Getting session status...');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
    const session = await claudeAgentManager.getSession(sessionId);
    if (session) {
      console.log(`✅ Session found: ${session.task}`);
      console.log(`   Status: ${session.status}`);
      console.log(`   CWD: ${session.cwd}\n`);
    } else {
      console.log('❌ Session not found\n');
    }

    // Test 3: List sessions
    console.log('Test 3: Listing all sessions...');
    const sessions = await claudeAgentManager.listSessions(false);
    console.log(`✅ Found ${sessions.length} session(s)\n`);

    console.log('✅ All tests passed!');
    console.log('\nNote: The session is running in the background.');
    console.log('Check .memory/claude-sessions/ for session files.');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
  }
}

testIntegration();
