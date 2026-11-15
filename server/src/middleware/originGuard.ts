import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { ApiError, ERROR_CODES } from '../utils/ApiError';

/**
 * CSRF Defence for cookie-authenticated endpoints (e.g. POST /auth/refresh, POST /auth/logout).
 * If an Origin header is present, it must match an allowed client origin.
 * If absent (non-browser clients like mobile apps or server-to-server calls), it is permitted.
 */
export function originGuard(req: Request, _res: Response, next: NextFunction): void {
  const origin = req.header('origin');

  if (origin) {
    let normalizedOrigin: string;
    try {
      normalizedOrigin = new URL(origin).origin;
    } catch {
      throw ApiError.forbidden(
        ERROR_CODES.ORIGIN_NOT_ALLOWED,
        'Invalid Origin header format'
      );
    }

    if (!env.CLIENT_ORIGINS.includes(normalizedOrigin)) {
      throw ApiError.forbidden(
        ERROR_CODES.ORIGIN_NOT_ALLOWED,
        'Origin header is not in the allowed client origins list'
      );
    }
  }

  next();
}
