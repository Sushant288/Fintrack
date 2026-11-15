import { CookieOptions, Response } from 'express';
import { env } from '../config/env';

export const REFRESH_COOKIE_NAME = 'fintrack_refresh_token';
export const AUTH_COOKIE_PATH = '/api/v1/auth';

export function getRefreshCookieMaxAgeMs(): number {
  return env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
}

export function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production' || env.COOKIE_SAMESITE === 'none',
    sameSite: env.COOKIE_SAMESITE,
    path: AUTH_COOKIE_PATH,
    maxAge: getRefreshCookieMaxAgeMs()
  };
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions());
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production' || env.COOKIE_SAMESITE === 'none',
    sameSite: env.COOKIE_SAMESITE,
    path: AUTH_COOKIE_PATH
  });
}
