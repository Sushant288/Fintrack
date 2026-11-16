import cron, { ScheduledTask } from 'node-cron';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { awaitRunningJobs, markStaleJobRuns } from './runJob';
import { runRecurringJob } from './recurring.job';

export interface RegisteredJob {
  name: string;
  cronExpression: string;
  runner: (now?: Date) => Promise<unknown>;
}

export const JOB_REGISTRY: Record<string, RegisteredJob> = {
  recurring: {
    name: 'recurring-generator',
    cronExpression: env.RECURRING_CRON,
    runner: runRecurringJob
  }
};

let cronTasks: ScheduledTask[] = [];
let isStarted = false;

/**
 * Initializes background scheduled jobs and performs initial stale run cleanup.
 */
export async function startJobs(): Promise<void> {
  if (!env.JOBS_ENABLED) {
    logger.info('Background jobs disabled via JOBS_ENABLED=false.');
    return;
  }

  if (isStarted) {
    return;
  }
  isStarted = true;

  // 1. Mark stale runs from prior unclean shutdowns
  try {
    await markStaleJobRuns();
  } catch (err: unknown) {
    logger.error('Failed to clean up stale JobRun records on startup', {
      error: err instanceof Error ? err.message : String(err)
    });
  }

  // 2. Schedule recurring rules runner
  const recurringTask = cron.schedule(env.RECURRING_CRON, async () => {
    try {
      await runRecurringJob();
    } catch (err: unknown) {
      logger.error('Error in scheduled recurring job execution', {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });
  cronTasks.push(recurringTask);
  logger.info(`Scheduled recurring job with expression "${env.RECURRING_CRON}".`);

  // 3. Catch-up execution on startup
  if (env.RUN_JOBS_ON_STARTUP) {
    logger.info('Triggering non-blocking catch-up run for recurring rules...');
    runRecurringJob().catch((err: unknown) => {
      logger.error('Startup catch-up run failed', {
        error: err instanceof Error ? err.message : String(err)
      });
    });
  }
}

/**
 * Stops scheduled tasks and awaits active job execution for clean shutdown.
 */
export async function stopJobs(): Promise<void> {
  for (const task of cronTasks) {
    task.stop();
  }
  cronTasks = [];
  isStarted = false;
  await awaitRunningJobs();
  logger.info('All scheduled background jobs stopped.');
}
