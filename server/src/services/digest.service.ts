import { LIMITS } from '../config/limits';
import { prisma } from '../config/prisma';
import { localHour } from '../utils/dates';
import { logger } from '../utils/logger';
import { sendEmail } from './email.service';

export class DigestService {
  /**
   * Delivers daily email digests of unread budget alerts to users who opted in.
   */
  static async sendDigests(
    now: Date = new Date(),
    opts?: { forceHourCheck?: boolean }
  ): Promise<{
    usersProcessed: number;
    emailsSent: number;
    failed: number;
  }> {
    // 1. Find all users with email alerts enabled
    const users = await prisma.user.findMany({
      where: { alertEmailEnabled: true },
      select: {
        id: true,
        email: true,
        name: true,
        timezone: true
      }
    });

    let usersProcessed = 0;
    let emailsSent = 0;
    let failed = 0;

    for (const u of users) {
      try {
        // Only trigger during the user's morning window (08:00 - 09:00) unless forced
        if (opts?.forceHourCheck !== false) {
          const hour = localHour(u.timezone, now);
          if (hour !== 8) {
            continue;
          }
        }

        usersProcessed++;

        // Fetch unread alerts for this user
        const unreadAlerts = await prisma.alert.findMany({
          where: { userId: u.id, isRead: false },
          orderBy: { createdAt: 'desc' },
          take: LIMITS.DIGEST.BATCH_SIZE
        });

        if (unreadAlerts.length === 0) {
          continue;
        }

        const lines = unreadAlerts.map(
          (a) => `- [${a.threshold}% Threshold] ${a.message} (${a.createdAt.toISOString().slice(0, 10)})`
        );

        const emailText = [
          `Hello ${u.name},`,
          '',
          `You have ${unreadAlerts.length} unread budget alert(s) in FinTrack:`,
          '',
          ...lines,
          '',
          'Please visit your FinTrack dashboard to review and adjust your budgets.',
          '',
          'Best regards,',
          'The FinTrack Team'
        ].join('\n');

        const emailResult = await sendEmail({
          to: u.email,
          subject: `FinTrack Daily Alert Digest - ${unreadAlerts.length} Unread Alert(s)`,
          text: emailText
        });

        if (emailResult.sent) {
          emailsSent++;
        }
      } catch (err) {
        failed++;
        logger.error('Failed to process alert digest for user', {
          userId: u.id,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    return { usersProcessed, emailsSent, failed };
  }
}
