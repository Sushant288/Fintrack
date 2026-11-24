import { JobStatus } from '@prisma/client';
import { LIMITS } from '../config/limits';
import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';

const runningJobs = new Map<string, Promise<{ skipped?: boolean; processed?: number; failed?: number }>>();

/**
 * Runs a background job with overlap protection, persistent JobRun logging,
 * and error suppression to protect the scheduler process.
 */
export async function runJob(
  name: string,
  fn: () => Promise<{ processed: number; failed: number }>
): Promise<{ skipped?: boolean; processed?: number; failed?: number }> {
  if (runningJobs.has(name)) {
    logger.warn(`Job "${name}" is already running; skipping execution.`);
    return { skipped: true };
  }

  const executionPromise = (async () => {
    let jobRunId: string | null = null;
    try {
      const jobRun = await prisma.jobRun.create({
        data: {
          jobName: name,
          status: JobStatus.RUNNING,
          startedAt: new Date()
        }
      });
      jobRunId = jobRun.id;
    } catch (err: unknown) {
      logger.error(`Failed to create JobRun record for "${name}"`, {
        error: err instanceof Error ? err.message : String(err)
      });
      return { skipped: true };
    }

    try {
      const result = await fn();
      await prisma.jobRun.update({
        where: { id: jobRunId },
        data: {
          status: JobStatus.SUCCESS,
          processed: result.processed,
          failed: result.failed,
          finishedAt: new Date()
        }
      });
      return { processed: result.processed, failed: result.failed };
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      const safeMessage = rawMessage.slice(0, LIMITS.JOB.ERROR_MESSAGE_MAX);

      logger.error(`Job "${name}" failed during execution`, {
        error: safeMessage
      });

      if (jobRunId) {
        try {
          await prisma.jobRun.update({
            where: { id: jobRunId },
            data: {
              status: JobStatus.FAILED,
              errorMessage: safeMessage,
              finishedAt: new Date()
            }
          });
        } catch (updateErr: unknown) {
          logger.error(`Failed to update JobRun status for "${name}"`, {
            error: updateErr instanceof Error ? updateErr.message : String(updateErr)
          });
        }
      }

      return { processed: 0, failed: 1 };
    } finally {
      runningJobs.delete(name);
    }
  })();

  runningJobs.set(name, executionPromise);
  return executionPromise;
}

/**
 * Marks RUNNING jobs older than LIMITS.JOB.STALE_AFTER_MIN as FAILED.
 */
export async function markStaleJobRuns(now: Date = new Date()): Promise<number> {
  const staleThreshold = new Date(now.getTime() - LIMITS.JOB.STALE_AFTER_MIN * 60 * 1000);
  const result = await prisma.jobRun.updateMany({
    where: {
      status: JobStatus.RUNNING,
      startedAt: { lte: staleThreshold }
    },
    data: {
      status: JobStatus.FAILED,
      errorMessage: 'Interrupted before completion',
      finishedAt: now
    }
  });

  if (result.count > 0) {
    logger.warn(`Marked ${result.count} stale JobRun records as FAILED.`);
  }

  return result.count;
}

/**
 * Waits for all currently running jobs to complete during graceful shutdown.
 */
export async function awaitRunningJobs(): Promise<void> {
  if (runningJobs.size > 0) {
    logger.info(`Waiting for ${runningJobs.size} active background job(s) to complete...`);
    await Promise.allSettled(Array.from(runningJobs.values()));
  }
}
