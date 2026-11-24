import dotenv from 'dotenv';
import cron from 'node-cron';
import { z } from 'zod';

// Load .env relative to current process cwd or config file
dotenv.config();

const rawEnv = process.env;
const defaultSameSite = rawEnv.NODE_ENV === 'production' ? 'strict' : 'lax';

const booleanString = (defaultValue: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .default(defaultValue)
    .transform((val, ctx) => {
      if (typeof val === 'boolean') return val;
      const lower = val.trim().toLowerCase();
      if (lower === 'true' || lower === '1') return true;
      if (lower === 'false' || lower === '0') return false;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Expected boolean string "true" or "false", got "${val}"`
      });
      return z.NEVER;
    });

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    JWT_ACCESS_SECRET: z
      .string()
      .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters long'),
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
    BCRYPT_COST: z.coerce.number().int().min(10).max(14).default(12),
    CLIENT_URL: z.string().min(1, 'CLIENT_URL is required'),
    COOKIE_SAMESITE: z
      .enum(['lax', 'strict', 'none'])
      .default(defaultSameSite),
    TRUST_PROXY: z.coerce.number().int().nonnegative().default(0),
    GENERAL_RATE_MAX: z.coerce.number().int().positive().default(300),
    GENERAL_RATE_WINDOW_MIN: z.coerce.number().int().positive().default(15),
    AUTH_RATE_MAX: z.coerce.number().int().positive().default(10),
    AUTH_RATE_WINDOW_MIN: z.coerce.number().int().positive().default(15),
    REGISTER_RATE_MAX: z.coerce.number().int().positive().default(10),
    REGISTER_RATE_WINDOW_MIN: z.coerce.number().int().positive().default(60),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    // Module B3: Jobs & Scheduler settings
    JOBS_ENABLED: booleanString(true),
    RUN_JOBS_ON_STARTUP: booleanString(true),
    RECURRING_CRON: z
      .string()
      .trim()
      .default('5 * * * *')
      .refine((val) => cron.validate(val), {
        message: 'RECURRING_CRON must be a valid cron expression'
      }),
    PROCESS_RATE_MAX: z.coerce.number().int().positive().default(6),
    PROCESS_RATE_WINDOW_MIN: z.coerce.number().int().positive().default(1),

    // Module B4: Scheduled jobs, rate limits, and email delivery
    REPORT_CRON: z
      .string()
      .trim()
      .default('15 2 1 * *')
      .refine((val) => cron.validate(val), {
        message: 'REPORT_CRON must be a valid cron expression'
      }),
    CLEANUP_CRON: z
      .string()
      .trim()
      .default('30 3 * * *')
      .refine((val) => cron.validate(val), {
        message: 'CLEANUP_CRON must be a valid cron expression'
      }),
    DIGEST_CRON: z
      .string()
      .trim()
      .default('0 8 * * *')
      .refine((val) => cron.validate(val), {
        message: 'DIGEST_CRON must be a valid cron expression'
      }),
    IMPORT_RATE_MAX: z.coerce.number().int().positive().default(10),
    IMPORT_RATE_WINDOW_MIN: z.coerce.number().int().positive().default(15),
    HEAVY_RATE_MAX: z.coerce.number().int().positive().default(20),
    HEAVY_RATE_WINDOW_MIN: z.coerce.number().int().positive().default(15),
    SMTP_HOST: z.string().trim().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: booleanString(false),
    SMTP_USER: z.string().trim().optional(),
    SMTP_PASS: z.string().trim().optional(),
    MAIL_FROM: z.string().trim().optional()
  })
  .superRefine((data, ctx) => {
    // Validate CLIENT_URL list
    const parts = data.CLIENT_URL.split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CLIENT_URL'],
        message: 'CLIENT_URL must contain at least one valid URL'
      });
    } else {
      for (const part of parts) {
        try {
          const parsed = new URL(part);
          if (!['http:', 'https:'].includes(parsed.protocol)) {
            throw new Error('Invalid protocol');
          }
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['CLIENT_URL'],
            message: `Invalid URL format in CLIENT_URL: "${part}"`
          });
        }
      }
    }

    // COOKIE_SAMESITE=none requires NODE_ENV=production
    if (data.COOKIE_SAMESITE === 'none' && data.NODE_ENV !== 'production') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_SAMESITE'],
        message: 'COOKIE_SAMESITE=none requires NODE_ENV=production because it forces secure=true'
      });
    }

    // SMTP validation
    const hasSmtpUser = Boolean(data.SMTP_USER);
    const hasSmtpPass = Boolean(data.SMTP_PASS);
    if (hasSmtpUser !== hasSmtpPass) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_USER'],
        message: 'SMTP_USER and SMTP_PASS must be both set or both absent'
      });
    }

    if (data.SMTP_HOST && !data.MAIL_FROM) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MAIL_FROM'],
        message: 'MAIL_FROM is required when SMTP_HOST is configured'
      });
    }
  });

const result = envSchema.safeParse(rawEnv);

if (!result.success) {
  console.error('\n======================================================');
  console.error('FATAL: Environment configuration validation failed:');
  const formatted = result.error.format();
  for (const [key, value] of Object.entries(formatted)) {
    if (key !== '_errors') {
      const errs = (value as any)._errors || [];
      if (errs.length > 0) {
        console.error(`  - ${key}: ${errs.join(', ')}`);
      }
    }
  }
  console.error('======================================================\n');
  process.exit(1);
}

const parsedEnv = result.data;

// Normalize origins (protocol + host without trailing slash)
const clientOrigins = parsedEnv.CLIENT_URL.split(',')
  .map((p) => p.trim())
  .filter(Boolean)
  .map((urlStr) => {
    const u = new URL(urlStr);
    return u.origin;
  });

export const env = {
  ...parsedEnv,
  CLIENT_ORIGINS: clientOrigins,
  EMAIL_ENABLED: Boolean(parsedEnv.SMTP_HOST)
};

export type Env = typeof env;
