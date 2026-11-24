import { describe, it, expect, beforeEach } from 'vitest';
import { api, refreshSession } from '@/api/client';
import { tokenStore } from '@/api/tokenStore';
import { server } from './server';
import { http, HttpResponse } from 'msw';
import { buildEnvelope, buildUser } from './factories';
import { ERROR_CODES } from '@/api/errorCodes';

describe('Group 11: SINGLE-FLIGHT REFRESH', () => {
  beforeEach(() => {
    tokenStore.clear();
  });

  it('coalesces 5 concurrent 401 requests into exactly ONE refresh call', async () => {
    let refreshCalls = 0;
    tokenStore.set('expired-concurrent-token', 10);

    server.use(
      http.post('http://localhost:4000/api/v1/auth/refresh', async () => {
        refreshCalls++;
        // Small delay to ensure all 5 requests are in-flight
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json(
          buildEnvelope({
            user: buildUser(),
            accessToken: 'refreshed-shared-token',
            expiresIn: 900
          })
        );
      }),
      http.get('http://localhost:4000/api/v1/concurrent-:id', ({ request, params }) => {
        const auth = request.headers.get('authorization');
        if (auth === 'Bearer refreshed-shared-token') {
          return HttpResponse.json(buildEnvelope({ item: params.id }));
        }
        return HttpResponse.json(
          buildEnvelope(null, null, { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Expired' }),
          { status: 401 }
        );
      })
    );

    const promises = [1, 2, 3, 4, 5].map((id) => api.get(`/concurrent-${id}`));
    const results = await Promise.all(promises);

    expect(refreshCalls).toBe(1);
    expect(results.length).toBe(5);
    results.forEach((res, idx) => {
      expect(res.data.data.item).toBe(String(idx + 1));
    });
  });

  it('StrictMode double-call produces exactly ONE refresh call', async () => {
    let refreshCalls = 0;

    server.use(
      http.post('http://localhost:4000/api/v1/auth/refresh', async () => {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 20));
        return HttpResponse.json(
          buildEnvelope({
            user: buildUser(),
            accessToken: 'token-strict',
            expiresIn: 900
          })
        );
      })
    );

    // Call refreshSession twice concurrently (like React StrictMode effect mount)
    const [s1, s2] = await Promise.all([refreshSession(), refreshSession()]);

    expect(refreshCalls).toBe(1);
    expect(s1.accessToken).toBe('token-strict');
    expect(s2.accessToken).toBe('token-strict');
  });
});
