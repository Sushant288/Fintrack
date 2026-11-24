import { JobStatus } from '@prisma/client';
import { LIMITS } from '../config/limits';
import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';

export class CleanupService {
  /**
   * Cleans up expired refresh tokens, old read alerts, and historical job run logs.
   */
  static async runCleanup(now: Date = new Date()): Promise<{
    tokensDeleted: number;
    alertsDeleted: number;
    jobRunsDeleted: number;
  }> {
    const tokenThreshold = new Date(
      now.getTime() - LIMITS.CLEANUP.REFRESH_TOKEN_GRACE_DAYS * 24 * 60 * 60 * 1000
    );
    const alertThreshold = new Date(
      now.getTime() - LIMITS.CLEANUP.READ_ALERT_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );
    const jobRunThreshold = new Date(
      now.getTime() - LIMITS.CLEANUP.JOB_RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );

    // 1. Delete expired / revoked refresh tokens
    const tokensResult = await prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: tokenThreshold } },
          { revokedAt: { not: null, lt: tokenThreshold } }
        ]
      }
    });

    // 2. Delete old read alerts
    const alertsResult = await prisma.alert.deleteMany({
      where: {
        isRead: true,
        createdAt: { lt: alertThreshold }
      }
    });

    // 3. Delete old completed/failed job run records
    const jobRunsResult = await prisma.jobRun.deleteMany({
      where: {
        status: { in: [JobStatus.SUCCESS, JobStatus.FAILED] },
        startedAt: { lt: jobRunThreshold }
      }
    });

    logger.info('Completed system data cleanup', {
      tokensDeleted: tokensResult.count,
      alertsDeleted: alertsResult.count,
      jobRunsDeleted: jobRunsResult.count
    });

    return {
      tokensDeleted: tokensResult.count,
      alertsDeleted: alertsResult.count,
      jobRunsDeleted: jobRunsResult.count
    };
  }
}
