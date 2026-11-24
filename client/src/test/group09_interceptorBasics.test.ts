import { describe, it, expect, beforeEach } from 'vitest';
import { api, bare } from '@/api/client';
import { tokenStore } from '@/api/tokenStore';
import { server } from './server';
import { http, HttpResponse } from 'msw';
import { buildEnvelope } from './factories';
import { ERROR_CODES } from '@/api/errorCodes';

describe('Group 9: INTERCEPTOR BASICS', () => {
  beforeEach(() => {
    tokenStore.clear();
  });

  it('attaches Authorization: Bearer header when token exists', async () => {
    let capturedAuthHeader: string | null = null;

    server.use(
      http.get('http://localhost:4000/api/v1/test-auth', ({ request }) => {
        capturedAuthHeader = request.headers.get('authorization');
        return HttpResponse.json(buildEnvelope({ ok: true }));
      })
    );

    tokenStore.set('test-jwt-token', 900);
    await api.get('/test-auth');

    expect(capturedAuthHeader).toBe('Bearer test-jwt-token');
  });

  it('does not attach Authorization header when user is logged out', async () => {
    let capturedAuthHeader: string | null = null;

    server.use(
      http.get('http://localhost:4000/api/v1/test-no-auth', ({ request }) => {
        capturedAuthHeader = request.headers.get('authorization');
        return HttpResponse.json(buildEnvelope({ ok: true }));
      })
    );

    tokenStore.clear();
    await api.get('/test-no-auth');

    expect(capturedAuthHeader).toBeNull();
  });

  it('401 with INVALID_CREDENTIALS on login passes through with NO refresh call', async () => {
    let refreshCalls = 0;

    server.use(
      http.post('http://localhost:4000/api/v1/auth/refresh', () => {
        refreshCalls++;
        return HttpResponse.json(buildEnvelope(null));
      }),
      http.post('http://localhost:4000/api/v1/auth/login', () => {
        return HttpResponse.json(
          buildEnvelope(null, null, {
            code: ERROR_CODES.INVALID_CREDENTIALS,
            message: 'Invalid email or password'
          }),
          { status: 401 }
        );
      })
    );

    try {
      await bare.post('/auth/login', { email: 'wrong@example.com', password: 'bad' });
      expect.fail('Expected 401 error');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status: number; data?: { error?: { code: string } } } };
      expect(axiosErr.response?.status).toBe(401);
      expect(axiosErr.response?.data?.error?.code).toBe(ERROR_CODES.INVALID_CREDENTIALS);
    }

    // Must not trigger refresh
    expect(refreshCalls).toBe(0);
  });
});
