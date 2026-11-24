import { runJob } from './runJob';
import { DigestService } from '../services/digest.service';

/**
 * Daily Alert Digest Job
 * Sends morning email digests of unread budget alerts to users who opted in.
 */
export async function runDigestJob(now: Date = new Date()) {
  return runJob('alert-digest', async () => {
    const result = await DigestService.sendDigests(now);
    return { processed: result.emailsSent, failed: result.failed };
  });
}
