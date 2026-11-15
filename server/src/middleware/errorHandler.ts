import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { ApiError, ERROR_CODES, ERROR_MESSAGES } from '../utils/ApiError';
import { fail } from '../utils/response';
import { logger } from '../utils/logger';

export function notFoundHandler(_req: Request, res: Response): Response {
  return fail(res, 404, ERROR_CODES.ROUTE_NOT_FOUND, ERROR_MESSAGES.ROUTE_NOT_FOUND);
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): Response {
  // Always log the actual error details and stack server-side with requestId
  logger.error(
    'Request encountered error',
    {
      error: err,
      method: req.method,
      path: req.originalUrl || req.url
    },
    req.requestId
  );

  // 1. ApiError
  if (err instanceof ApiError) {
    return fail(res, err.statusCode, err.code, err.message, err.details);
  }

  // 2. Zod validation error
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join('.') || 'payload',
      message: issue.message
    }));
    return fail(
      res,
      400,
      ERROR_CODES.VALIDATION_ERROR,
      ERROR_MESSAGES.VALIDATION_ERROR,
      details
    );
  }

  // 3. Body-parser errors
  const anyErr = err as { type?: string; status?: number; statusCode?: number };
  if (anyErr?.type === 'entity.parse.failed') {
    return fail(res, 400, ERROR_CODES.INVALID_JSON, ERROR_MESSAGES.INVALID_JSON);
  }
  if (anyErr?.type === 'entity.too.large') {
    return fail(
      res,
      413,
      ERROR_CODES.PAYLOAD_TOO_LARGE,
      ERROR_MESSAGES.PAYLOAD_TOO_LARGE
    );
  }

  // 4. Prisma known request errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return fail(res, 409, ERROR_CODES.CONFLICT, ERROR_MESSAGES.CONFLICT);
      case 'P2003':
        return fail(
          res,
          409,
          ERROR_CODES.CONFLICT,
          'Referenced record is in use or does not exist'
        );
      case 'P2004':
        return fail(
          res,
          400,
          ERROR_CODES.CONSTRAINT_VIOLATION,
          ERROR_MESSAGES.CONSTRAINT_VIOLATION
        );
      case 'P2025':
        return fail(res, 404, ERROR_CODES.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
    }
  }

  // 5. Fallback internal server error
  return fail(res, 500, ERROR_CODES.INTERNAL_ERROR, ERROR_MESSAGES.INTERNAL_ERROR);
}
