import { runJob } from './runJob';
import { CleanupService } from '../services/cleanup.service';

/**
 * Daily System Cleanup Job
 * Purges expired refresh tokens, historical read alerts, and old job runs.
 */
export async function runCleanupJob(now: Date = new Date()) {
  return runJob('cleanup', async () => {
    const result = await CleanupService.runCleanup(now);
    const totalProcessed =
      result.tokensDeleted + result.alertsDeleted + result.jobRunsDeleted;
    return { processed: totalProcessed, failed: 0 };
  });
}
