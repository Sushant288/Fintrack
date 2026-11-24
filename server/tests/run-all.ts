import { spawn, ChildProcess } from 'child_process';
import path from 'path';

interface SuiteResult {
  suite: string;
  command: string;
  durationMs: number;
  passed: boolean;
  exitCode: number | null;
}

const suites = [
  { suite: 'Module B1: Core & Identity', script: 'tests/smoke/b1.smoke.ts' },
  { suite: 'Module B2: Money Core', script: 'tests/smoke/b2.smoke.ts' },
  { suite: 'Module B3: Automation & Goals', script: 'tests/smoke/b3.smoke.ts' },
  { suite: 'Module B4: Insights & Hardening', script: 'tests/smoke/b4.smoke.ts' }
];

async function isServerReady(url: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    return res.status === 200;
  } catch {
    return false;
  }
}

async function runCommand(cmd: string, args: string[]): Promise<{ exitCode: number | null; durationMs: number }> {
  const start = Date.now();
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      stdio: 'inherit',
      shell: true,
      cwd: path.resolve(__dirname, '..')
    });

    proc.on('close', (exitCode) => {
      resolve({ exitCode, durationMs: Date.now() - start });
    });
  });
}

async function main() {
  console.log('================================================================');
  console.log('          FinTrack Full Smoke Test Suite Runner (B1 - B4)       ');
  console.log('================================================================\n');

  const healthUrl = 'http://localhost:4000/health';
  let serverProc: ChildProcess | null = null;
  let startedServer = false;

  try {
    if (!(await isServerReady(healthUrl))) {
      console.log('No active server detected on port 4000. Launching background server...');
      serverProc = spawn('npx', ['tsx', 'src/server.ts'], {
        cwd: path.resolve(__dirname, '..'),
        shell: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          GENERAL_RATE_MAX: '3000',
          IMPORT_RATE_MAX: '100',
          HEAVY_RATE_MAX: '500'
        }
      });
      startedServer = true;

      // Poll until server is ready
      let ready = false;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (await isServerReady(healthUrl)) {
          ready = true;
          break;
        }
      }

      if (!ready) {
        throw new Error('Timed out waiting for test server to respond on port 4000');
      }
      console.log('Background server started and verified ready.\n');
    } else {
      console.log('Existing server detected on port 4000.\n');
    }

    const results: SuiteResult[] = [];
    let allPassed = true;

    for (const s of suites) {
      console.log(`\n>>> Running ${s.suite} (${s.script})...\n`);
      const { exitCode, durationMs } = await runCommand('npx', ['tsx', s.script]);
      const passed = exitCode === 0;
      if (!passed) allPassed = false;

      results.push({
        suite: s.suite,
        command: `tsx ${s.script}`,
        durationMs,
        passed,
        exitCode
      });
    }

    console.log('\n================================================================');
    console.log('                      TEST RUNNER SUMMARY                       ');
    console.log('================================================================\n');

    console.table(
      results.map((r) => ({
        Suite: r.suite,
        Duration: `${(r.durationMs / 1000).toFixed(2)}s`,
        Result: r.passed ? 'PASS' : 'FAIL',
        Code: r.exitCode ?? 'SIG'
      }))
    );

    if (allPassed) {
      console.log('\n🎉 ALL MODULE TEST SUITES PASSED CLEANLY!\n');
      process.exit(0);
    } else {
      console.error('\n❌ ONE OR MORE TEST SUITES FAILED.\n');
      process.exit(1);
    }
  } finally {
    if (startedServer && serverProc && serverProc.pid) {
      console.log('Shutting down background server...');
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(serverProc.pid), '/f', '/t']);
        } else {
          serverProc.kill('SIGTERM');
        }
      } catch {}
    }
  }
}

main().catch((err) => {
  console.error('Test runner encountered an error:', err);
  process.exit(1);
});
