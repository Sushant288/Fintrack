import { spawn } from 'child_process';
import path from 'path';
import { LIMITS } from '../src/config/limits';

async function main() {
  console.log('================================================================');
  console.log('            FinTrack Code Coverage Verification Runner          ');
  console.log(` Target Threshold: >= ${LIMITS.COVERAGE.MIN_PERCENT}% Line Coverage on Services `);
  console.log('================================================================\n');

  const c8Args = [
    'c8',
    '--check-coverage',
    `--lines=${LIMITS.COVERAGE.MIN_PERCENT}`,
    '--reporter=text',
    '--reporter=text-summary',
    '--all',
    '--include=src/services/analytics.service.ts',
    '--include=src/services/csv.service.ts',
    '--include=src/services/import.service.ts',
    '--include=src/services/pdf.service.ts',
    '--include=src/services/report.service.ts',
    '--include=src/services/cleanup.service.ts',
    '--include=src/services/digest.service.ts',
    '--include=src/services/email.service.ts',
    '--exclude=tests/**',
    'tsx',
    'tests/smoke/b4.smoke.ts'
  ];

  const start = Date.now();
  const proc = spawn('npx', c8Args, {
    stdio: 'inherit',
    shell: true,
    cwd: path.resolve(__dirname, '..')
  });

  proc.on('close', (exitCode) => {
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    if (exitCode === 0) {
      console.log(`\n✅ Code coverage criteria satisfied (took ${duration}s).\n`);
      process.exit(0);
    } else {
      console.error(`\n❌ Code coverage threshold not met or test failed (exit code ${exitCode}).\n`);
      process.exit(exitCode || 1);
    }
  });
}

main().catch((err) => {
  console.error('Coverage runner error:', err);
  process.exit(1);
});
