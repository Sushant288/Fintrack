import { isAxiosError } from 'axios';
import { ERROR_CODES, ErrorCode } from './errorCodes';
import { FieldError } from '@/types';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ErrorCode | string;
  readonly details: unknown;
  readonly requestId: string | null;
  readonly retryAfterSeconds: number | null;
  readonly fieldErrors: FieldError[];

  constructor(params: {
    message: string;
    status: number;
    code: ErrorCode | string;
    details?: unknown;
    requestId?: string | null;
    retryAfterSeconds?: number | null;
  }) {
    super(params.message);
    this.name = 'ApiClientError';
    this.status = params.status;
    this.code = params.code;
    this.details = params.details;
    this.requestId = params.requestId ?? null;
    this.retryAfterSeconds = params.retryAfterSeconds ?? null;

    // Parse field errors if details is array of FieldError
    if (Array.isArray(params.details)) {
      this.fieldErrors = params.details.filter(
        (item): item is FieldError =>
          typeof item === 'object' && item !== null && 'field' in item && 'message' in item
      );
    } else {
      this.fieldErrors = [];
    }
  }
}

export function normalizeError(err: unknown): ApiClientError {
  if (err instanceof ApiClientError) {
    return err;
  }

  if (isAxiosError(err)) {
    const status = err.response?.status ?? (err.code === 'ECONNABORTED' ? 408 : 0);
    const data = err.response?.data;
    const headers = err.response?.headers;

    // Extract RequestId
    let requestId: string | null = null;
    if (headers && typeof headers['x-request-id'] === 'string') {
      requestId = headers['x-request-id'];
    }

    // Extract Retry-After
    let retryAfterSeconds: number | null = null;
    if (headers && headers['retry-after']) {
      const parsed = parseInt(String(headers['retry-after']), 10);
      if (!isNaN(parsed) && parsed > 0) {
        retryAfterSeconds = parsed;
      }
    }

    // Network / Offline error
    if (!err.response && (err.code === 'ERR_NETWORK' || !window.navigator.onLine)) {
      return new ApiClientError({
        message: "Can't reach the server. Check your connection and try again.",
        status: 0,
        code: ERROR_CODES.NETWORK_ERROR,
        requestId
      });
    }

    // Timeout error
    if (err.code === 'ECONNABORTED' || err.message.toLowerCase().includes('timeout')) {
      return new ApiClientError({
        message: 'The request timed out. Please try again.',
        status: 408,
        code: ERROR_CODES.TIMEOUT,
        requestId
      });
    }

    // Response with standard envelope { error: { code, message, details } }
    if (data && typeof data === 'object' && 'error' in data && data.error) {
      const apiErr = data.error as { code?: string; message?: string; details?: unknown };
      return new ApiClientError({
        message: apiErr.message || err.message || 'An error occurred',
        status,
        code: apiErr.code || ERROR_CODES.UNKNOWN,
        details: apiErr.details,
        requestId,
        retryAfterSeconds
      });
    }

    // Non-JSON or HTML 502/503 response
    return new ApiClientError({
      message: err.message || `Request failed with status ${status}`,
      status,
      code: ERROR_CODES.UNKNOWN,
      requestId,
      retryAfterSeconds
    });
  }

  if (err instanceof Error) {
    return new ApiClientError({
      message: err.message,
      status: 500,
      code: ERROR_CODES.UNKNOWN
    });
  }

  return new ApiClientError({
    message: 'An unexpected error occurred',
    status: 500,
    code: ERROR_CODES.UNKNOWN
  });
}
