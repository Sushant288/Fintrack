import crypto from 'crypto';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env';

const JWT_ISSUER = 'fintrack';
const JWT_AUDIENCE = 'fintrack-api';

export function accessTtlSeconds(): number {
  return env.ACCESS_TOKEN_TTL_MINUTES * 60;
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: accessTtlSeconds()
  });
}

export function verifyAccessToken(token: string): string {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE
  }) as JwtPayload;

  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Token payload missing subject identifier');
  }

  return payload.sub;
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshExpiryDate(from: Date = new Date()): Date {
  const ttlMs = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
  return new Date(from.getTime() + ttlMs);
}
