import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../utils/logger';

let testTransport: Transporter | null = null;
let activeTransporter: Transporter | null = null;

/**
 * Injects a mock nodemailer Transporter for smoke and unit test assertions.
 */
export function __setMailTransportForTests(mockTransport: Transporter | null): void {
  testTransport = mockTransport;
}

export function getTransporter(): Transporter | null {
  if (testTransport) {
    return testTransport;
  }
  if (!env.EMAIL_ENABLED) {
    return null;
  }
  if (!activeTransporter) {
    activeTransporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? {
              user: env.SMTP_USER,
              pass: env.SMTP_PASS
            }
          : undefined
    });
  }
  return activeTransporter;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

/**
 * Delivers email using configured SMTP transporter, or logs and skips if SMTP is not configured.
 */
export async function sendEmail(
  opts: SendMailOptions
): Promise<{ sent: boolean; messageId?: string }> {
  const transporter = getTransporter();
  if (!transporter) {
    logger.debug('Email delivery skipped (SMTP not configured)', {
      to: opts.to,
      subject: opts.subject
    });
    return { sent: false };
  }

  const fromAddress = env.MAIL_FROM || 'FinTrack <no-reply@fintrack.local>';
  const res = await transporter.sendMail({
    from: fromAddress,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    attachments: opts.attachments
  });

  logger.info('Email sent successfully', { to: opts.to, messageId: res.messageId });
  return { sent: true, messageId: res.messageId };
}
