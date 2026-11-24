import { describe, it, expect } from 'vitest';
import { normalizeError, ApiClientError } from '@/api/errors';
import { ERROR_CODES } from '@/api/errorCodes';
import { AxiosError, AxiosHeaders } from 'axios';

describe('Group 5: ERROR NORMALIZER', () => {
  it('preserves existing ApiClientError instances', () => {
    const err = new ApiClientError({
      message: 'Custom error',
      status: 400,
      code: ERROR_CODES.VALIDATION_ERROR
    });
    expect(normalizeError(err)).toBe(err);
  });

  it('normalizes standard API envelope error with headers', () => {
    const headers = new AxiosHeaders();
    headers.set('x-request-id', 'req-987');
    headers.set('retry-after', '45');

    const axiosErr = new AxiosError(
      'Request failed',
      'ERR_BAD_REQUEST',
      undefined,
      undefined,
      {
        status: 400,
        statusText: 'Bad Request',
        headers,
        config: { headers: new AxiosHeaders() },
        data: {
          data: null,
          meta: null,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Validation failed',
            details: [{ field: 'name', message: 'Name is too short' }]
          }
        }
      }
    );

    const norm = normalizeError(axiosErr);
    expect(norm.status).toBe(400);
    expect(norm.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(norm.message).toBe('Validation failed');
    expect(norm.requestId).toBe('req-987');
    expect(norm.retryAfterSeconds).toBe(45);
    expect(norm.fieldErrors).toEqual([{ field: 'name', message: 'Name is too short' }]);
  });

  it('normalizes HTML 502/503 response into UNKNOWN error code', () => {
    const axiosErr = new AxiosError(
      'Bad Gateway',
      'ERR_BAD_RESPONSE',
      undefined,
      undefined,
      {
        status: 502,
        statusText: 'Bad Gateway',
        headers: new AxiosHeaders(),
        config: { headers: new AxiosHeaders() },
        data: '<html><body>502 Bad Gateway</body></html>'
      }
    );

    const norm = normalizeError(axiosErr);
    expect(norm.status).toBe(502);
    expect(norm.code).toBe(ERROR_CODES.UNKNOWN);
  });

  it('normalizes timeout errors into TIMEOUT error code', () => {
    const axiosErr = new AxiosError(
      'timeout of 15000ms exceeded',
      'ECONNABORTED'
    );

    const norm = normalizeError(axiosErr);
    expect(norm.status).toBe(408);
    expect(norm.code).toBe(ERROR_CODES.TIMEOUT);
  });

  it('normalizes network errors into NETWORK_ERROR code', () => {
    const axiosErr = new AxiosError('Network Error', 'ERR_NETWORK');

    const norm = normalizeError(axiosErr);
    expect(norm.status).toBe(0);
    expect(norm.code).toBe(ERROR_CODES.NETWORK_ERROR);
  });
});
