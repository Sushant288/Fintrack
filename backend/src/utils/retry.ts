export interface RetryOptions {
  maxRetries: number;
  baseMs: number;
  isTransient?: (err: unknown) => boolean;
}

function defaultIsTransient(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;
  if (e.code === 'P2034') return true;
  if (typeof e.message === 'string') {
    if (e.message.includes('P2034')) return true;
    if (e.message.includes('could not serialize access')) return true;
    if (e.message.includes('deadlock detected')) return true;
    if (e.message.includes('40001') || e.message.includes('40P01')) return true;
  }
  return false;
}

/**
 * Retries an asynchronous operation with exponential backoff on transient errors.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const { maxRetries, baseMs, isTransient = defaultIsTransient } = opts;
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (err: unknown) {
      if (attempt >= maxRetries || !isTransient(err)) {
        throw err;
      }
      const delayMs = baseMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      attempt++;
    }
  }
}
