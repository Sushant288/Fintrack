import { runJob } from './runJob';
import { runDueRules } from '../services/recurring.service';
import { logger } from '../utils/logger';

/**
 * Scheduled recurring rule executor.
 */
export async function runRecurringJob(
  now?: Date
): Promise<{ skipped?: boolean; processed?: number; failed?: number }> {
  return runJob('recurring-generator', async () => {
    const summary = await runDueRules({ now });
    logger.info('Recurring job execution completed', {
      scanned: summary.scanned,
      rulesProcessed: summary.rulesProcessed,
      generated: summary.generated,
      failed: summary.failed,
      blocked: summary.blocked,
      skippedLocked: summary.skippedLocked,
      alertCount: summary.alerts.length
    });
    return {
      processed: summary.generated,
      failed: summary.failed
    };
  });
}
