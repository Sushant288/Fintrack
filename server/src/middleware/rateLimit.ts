import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { ERROR_CODES, ERROR_MESSAGES } from '../utils/ApiError';
import { fail } from '../utils/response';

/**
 * NOTE: The limiters below use the default in-memory store.
 * For multi-instance, clustered, or serverless deployments, a shared store (such as Redis) is required.
 */

function rateLimitHandler(message: string) {
  return (req: any, res: any, _next: any, options: any) => {
    const retryAfterSeconds = Math.ceil(options.windowMs / 1000);
    res.setHeader('Retry-After', retryAfterSeconds.toString());
    return fail(
      res,
      429,
      ERROR_CODES.RATE_LIMITED,
      message || ERROR_MESSAGES.RATE_LIMITED
    );
  };
}

export const generalLimiter = rateLimit({
  windowMs: env.GENERAL_RATE_WINDOW_MIN * 60 * 1000,
  limit: env.GENERAL_RATE_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitHandler('Too many requests, please try again later.')
});

export const registerLimiter = rateLimit({
  windowMs: env.REGISTER_RATE_WINDOW_MIN * 60 * 1000,
  limit: env.REGISTER_RATE_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitHandler('Too many accounts created from this IP, please try again later.')
});

export const loginLimiter = rateLimit({
  windowMs: env.AUTH_RATE_WINDOW_MIN * 60 * 1000,
  limit: env.AUTH_RATE_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email =
      typeof req.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : 'unknown';
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    return `${clientIp}|${email}`;
  },
  handler: rateLimitHandler('Too many failed login attempts, please try again later.')
});
