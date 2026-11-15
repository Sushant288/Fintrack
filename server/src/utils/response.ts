import { Response } from 'express';
import { ErrorCode } from './ApiError';

export interface SuccessEnvelope<T = unknown> {
  data: T;
  meta: Record<string, unknown> | null;
  error: null;
}

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export interface FailureEnvelope {
  data: null;
  meta: null;
  error: ErrorPayload;
}

export function ok<T>(
  res: Response,
  data: T,
  meta: Record<string, unknown> | null = null,
  status = 200
): Response {
  const envelope: SuccessEnvelope<T> = {
    data,
    meta,
    error: null
  };
  return res.status(status).json(envelope);
}

export function fail(
  res: Response,
  status: number,
  code: ErrorCode,
  message: string,
  details?: unknown
): Response {
  const envelope: FailureEnvelope = {
    data: null,
    meta: null,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {})
    }
  };
  return res.status(status).json(envelope);
}
