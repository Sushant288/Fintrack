import { LIMITS } from '../config/limits';
import { prisma } from '../config/prisma';
import { previousMonth, todayInTimeZone } from '../utils/dates';
import { logger } from '../utils/logger';
import { runJob } from './runJob';
import { ReportService } from '../services/report.service';

/**
 * Monthly Report Generator Job
 * Scans users and materializes cached Report snapshots for due past months.
 */
export async function runReportJob(now: Date = new Date()) {
  return runJob('report-generator', async () => {
    const users = await prisma.user.findMany({
      select: { id: true, timezone: true }
    });

    let processed = 0;
    let failed = 0;

    for (const u of users) {
      try {
        const today = todayInTimeZone(u.timezone, now);
        const [curY, curM] = today.split('-').map(Number);

        // Check lookback months (default past 2 months)
        let target = previousMonth(curY, curM);
        for (let i = 0; i < LIMITS.REPORT.DUE_LOOKBACK_MONTHS; i++) {
          const exists = await prisma.report.findUnique({
            where: {
              userId_month_year: {
                userId: u.id,
                month: target.month,
                year: target.year
              }
            }
          });

          if (!exists) {
            await ReportService.getReport(u.id, target.year, target.month);
            processed++;
          }

          target = previousMonth(target.year, target.month);
        }
      } catch (err) {
        failed++;
        logger.error('Failed generating report snapshot for user', {
          userId: u.id,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    return { processed, failed };
  });
}
