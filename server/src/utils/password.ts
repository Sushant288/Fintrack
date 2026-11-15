import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { env } from '../config/env';

let memoizedDummyHash: string | null = null;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Returns a lazily generated, memoized dummy hash.
 * Used to equalize login timing for non-existent emails, preventing timing attacks.
 */
export function getDummyHash(): string {
  if (!memoizedDummyHash) {
    const randomSecret = crypto.randomBytes(32).toString('hex');
    memoizedDummyHash = bcrypt.hashSync(randomSecret, env.BCRYPT_COST);
  }
  return memoizedDummyHash;
}
