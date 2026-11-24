import { describe, it, expect, vi, beforeEach } from 'vitest';
import { refreshSession, SESSION_EXPIRED_EVENT } from '@/api/client';
import { tokenStore } from '@/api/tokenStore';
import { server } from './server';
import { http, HttpResponse } from 'msw';
import { buildEnvelope } from './factories';
import { ERROR_CODES } from '@/api/errorCodes';

describe('Group 12: REFRESH FAILURE HANDLING', () => {
  beforeEach(() => {
    tokenStore.clear();
  });

  it('clears token store and emits session-expired event on REFRESH_TOKEN_REUSED', async () => {
    tokenStore.set('stale-token', 60);

    const expiredListener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, expiredListener);

    server.use(
      http.post('http://localhost:4000/api/v1/auth/refresh', () => {
        return HttpResponse.json(
          buildEnvelope(null, null, {
            code: ERROR_CODES.REFRESH_TOKEN_REUSED,
            message: 'Refresh token reuse detected'
          }),
          { status: 401 }
        );
      })
    );

    try {
      await refreshSession();
      expect.fail('Expected refresh to reject');
    } catch (err: unknown) {
      const apiErr = err as { code?: string };
      expect(apiErr.code).toBe(ERROR_CODES.REFRESH_TOKEN_REUSED);
    }

    expect(tokenStore.getAccessToken()).toBeNull();
    expect(expiredListener).toHaveBeenCalledTimes(1);

    window.removeEventListener(SESSION_EXPIRED_EVENT, expiredListener);
  });

  it('keeps session and does NOT emit session-expired on network error during refresh', async () => {
    tokenStore.set('existing-valid-token', 600);

    const expiredListener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, expiredListener);

    server.use(
      http.post('http://localhost:4000/api/v1/auth/refresh', () => {
        return HttpResponse.error(); // Network failure
      })
    );

    try {
      await refreshSession();
      expect.fail('Expected network error');
    } catch (err: unknown) {
      const apiErr = err as { code?: string };
      expect(apiErr.code).toBe(ERROR_CODES.NETWORK_ERROR);
    }

    // Token must remain kept (not logged out)
    expect(tokenStore.getAccessToken()).toBe('existing-valid-token');
    expect(expiredListener).not.toHaveBeenCalled();

    window.removeEventListener(SESSION_EXPIRED_EVENT, expiredListener);
  });
});
