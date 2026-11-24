import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny } from 'zod';
import { ApiError, ERROR_CODES } from '../utils/ApiError';

export interface ValidationSchemaGroup {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function validate(schemas: ValidationSchemaGroup) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const details: Array<{ field: string; message: string }> = [];

    if (!req.validated) {
      req.validated = {};
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        for (const issue of result.error.issues) {
          details.push({
            field: issue.path.join('.') || 'params',
            message: issue.message
          });
        }
      } else {
        req.validated.params = result.data;
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        for (const issue of result.error.issues) {
          details.push({
            field: issue.path.join('.') || 'query',
            message: issue.message
          });
        }
      } else {
        req.validated.query = result.data;
      }
    }

    if (schemas.body) {
      const bodyToParse = req.body ?? {};
      const result = schemas.body.safeParse(bodyToParse);
      if (!result.success) {
        for (const issue of result.error.issues) {
          details.push({
            field: issue.path.join('.') || 'body',
            message: issue.message
          });
        }
      } else {
        req.validated.body = result.data;
      }
    }

    if (details.length > 0) {
      throw ApiError.badRequest(ERROR_CODES.VALIDATION_ERROR, undefined, details);
    }

    next();
  };
}

/**
 * Single typed retrieval helper for pre-validated request payload sections.
 */
export function getValidated<TBody = unknown, TQuery = unknown, TParams = unknown>(
  req: Request
): { body: TBody; query: TQuery; params: TParams } {
  // Cast validated input properties to strongly-typed generic targets inferred from schemas
  return req.validated as { body: TBody; query: TQuery; params: TParams };
}
