import { execSync } from "child_process";

/**
 * Kills existing instances of the application to prevent multiple instances
 * from running simultaneously (useful when using --watch or --hot)
 */
export function killExistingInstances(port?: number) {
  const currentPid = process.pid.toString();
  let killedCount = 0;

  try {
    // Only kill processes using the specified port (if provided)
    // Don't kill all Bun processes as that would kill the watch process
    if (port) {
      try {
        // Find processes using the port (macOS/Linux)
        const result = execSync(`lsof -ti:${port}`, { 
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "ignore"]
        }).trim();
        
        if (result) {
          const pids = result.split("\n").filter(Boolean);
          const otherPids = pids.filter(pid => pid !== currentPid);
          
          if (otherPids.length > 0) {
            console.log(`🔪 Found ${otherPids.length} process(es) using port ${port}, killing...`);
            for (const pid of otherPids) {
              try {
                // Use SIGTERM first for graceful shutdown, then SIGKILL if needed
                execSync(`kill -TERM ${pid}`, { stdio: "ignore" });
                // Wait a bit for graceful shutdown
                Bun.sleepSync(100);
                // Force kill if still running
                try {
                  execSync(`kill -9 ${pid}`, { stdio: "ignore" });
                } catch (e) {
                  // Process already dead, that's fine
                }
                killedCount++;
              } catch (e) {
                // Process might already be dead, ignore
              }
            }
          }
        }
      } catch (e: any) {
        // lsof returns non-zero exit code when no processes found - that's fine
        if (e.status !== 1) {
          // Only warn if it's not the expected "no processes" error
          console.warn(`Warning checking port ${port}:`, e.message);
        }
      }
    }

    // Kill any Python processes from unified_voice.py (wake word detector)
    // These are child processes that should be cleaned up
    try {
      let pythonProcesses = "";
      try {
        pythonProcesses = execSync(
          `pgrep -f "unified_voice.py" || ps aux | grep "unified_voice.py" | grep -v grep | awk '{print $2}'`,
          { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
        ).trim();
      } catch (e) {
        try {
          pythonProcesses = execSync(
            `ps aux | grep "unified_voice.py" | grep -v grep | awk '{print $2}'`,
            { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
          ).trim();
        } catch (e2) {
          // No processes found
        }
      }

      if (pythonProcesses) {
        const pids = pythonProcesses.split("\n").filter(Boolean);
        const validPids = pids.filter(pid => pid.trim() !== "");

        if (validPids.length > 0) {
          console.log(`🔪 Found ${validPids.length} wake word detector process(es), killing...`);
          for (const pid of validPids) {
            try {
              execSync(`kill -9 ${pid}`, { stdio: "ignore" });
              killedCount++;
            } catch (e) {
              // Process might already be dead, ignore
            }
          }
        }
      }
    } catch (e) {
      // No processes found, that's fine
    }

    if (killedCount > 0) {
      console.log(`✅ Killed ${killedCount} existing process(es)`);
      // Small delay to ensure processes are fully terminated
      Bun.sleepSync(300);
    } else {
      console.log("✅ No existing instances found");
    }
  } catch (error: any) {
    // If anything fails, log but don't crash - we'll try to start anyway
    console.warn("⚠️  Warning: Could not fully clean up existing instances:", error.message);
  }
}
