import { describe, it, expect, beforeEach } from 'vitest';
import { api } from '@/api/client';
import { tokenStore } from '@/api/tokenStore';
import { server } from './server';
import { http, HttpResponse } from 'msw';
import { buildEnvelope, buildUser } from './factories';
import { ERROR_CODES } from '@/api/errorCodes';

describe('Group 10: REFRESH + RETRY', () => {
  beforeEach(() => {
    tokenStore.clear();
  });

  it('refreshes token on 401 TOKEN_EXPIRED and retries request once with success', async () => {
    let refreshCalls = 0;
    let protectedAttempts = 0;

    tokenStore.set('expired-token', 10);

    server.use(
      http.post('http://localhost:4000/api/v1/auth/refresh', () => {
        refreshCalls++;
        return HttpResponse.json(
          buildEnvelope({
            user: buildUser(),
            accessToken: 'fresh-new-token',
            expiresIn: 900
          })
        );
      }),
      http.get('http://localhost:4000/api/v1/protected-resource', ({ request }) => {
        protectedAttempts++;
        const auth = request.headers.get('authorization');

        if (auth === 'Bearer expired-token') {
          return HttpResponse.json(
            buildEnvelope(null, null, {
              code: ERROR_CODES.TOKEN_EXPIRED,
              message: 'Access token expired'
            }),
            { status: 401 }
          );
        }

        if (auth === 'Bearer fresh-new-token') {
          return HttpResponse.json(buildEnvelope({ secretData: 42 }));
        }

        return HttpResponse.json(buildEnvelope(null, null, { code: 'UNAUTHORIZED', message: 'No auth' }), { status: 401 });
      })
    );

    const res = await api.get<{ data: { secretData: number } }>('/protected-resource');

    expect(refreshCalls).toBe(1);
    expect(protectedAttempts).toBe(2);
    expect(res.data.data.secretData).toBe(42);
    expect(tokenStore.getAccessToken()).toBe('fresh-new-token');
  });

  it('does not loop when retried request also returns 401', async () => {
    let refreshCalls = 0;
    let protectedAttempts = 0;

    tokenStore.set('token-1', 10);

    server.use(
      http.post('http://localhost:4000/api/v1/auth/refresh', () => {
        refreshCalls++;
        return HttpResponse.json(
          buildEnvelope({
            user: buildUser(),
            accessToken: 'token-2',
            expiresIn: 900
          })
        );
      }),
      http.get('http://localhost:4000/api/v1/always-401', () => {
        protectedAttempts++;
        return HttpResponse.json(
          buildEnvelope(null, null, {
            code: ERROR_CODES.TOKEN_EXPIRED,
            message: 'Still rejected'
          }),
          { status: 401 }
        );
      })
    );

    try {
      await api.get('/always-401');
      expect.fail('Expected request to fail');
    } catch (err: unknown) {
      const apiErr = err as { status?: number };
      expect(apiErr.status).toBe(401);
    }

    // Refresh should have been called only once, and request retried only once (2 attempts total)
    expect(refreshCalls).toBe(1);
    expect(protectedAttempts).toBe(2);
  });
});
