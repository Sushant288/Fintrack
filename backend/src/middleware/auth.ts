import { Request, Response, NextFunction } from 'express';
import { ApiError, ERROR_CODES } from '../utils/ApiError';
import { verifyAccessToken } from '../utils/tokens';

/**
 * KNOWN ACCEPTED LIMITATION:
 * An access token stays valid until it expires (max ACCESS_TOKEN_TTL_MINUTES)
 * after logout or password change; refresh tokens are revoked immediately in the database.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.header('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw ApiError.unauthorized(
      ERROR_CODES.UNAUTHORIZED,
      'Authentication required: missing or invalid Bearer token'
    );
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    throw ApiError.unauthorized(
      ERROR_CODES.UNAUTHORIZED,
      'Authentication required: empty Bearer token'
    );
  }

  try {
    const userId = verifyAccessToken(token);
    req.user = { id: userId };
    next();
  } catch (err: any) {
    if (err?.name === 'TokenExpiredError') {
      throw ApiError.unauthorized(
        ERROR_CODES.TOKEN_EXPIRED,
        'Access token has expired'
      );
    }
    throw ApiError.unauthorized(
      ERROR_CODES.UNAUTHORIZED,
      'Invalid or corrupted access token'
    );
  }
}
