export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_JSON: 'INVALID_JSON',
  CONSTRAINT_VIOLATION: 'CONSTRAINT_VIOLATION',
  CURRENT_PASSWORD_INCORRECT: 'CURRENT_PASSWORD_INCORRECT',
  SAME_PASSWORD: 'SAME_PASSWORD',
  INVALID_REASSIGN_TARGET: 'INVALID_REASSIGN_TARGET',
  INVALID_PARENT: 'INVALID_PARENT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  REFRESH_TOKEN_MISSING: 'REFRESH_TOKEN_MISSING',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  REFRESH_TOKEN_REUSED: 'REFRESH_TOKEN_REUSED',
  ORIGIN_NOT_ALLOWED: 'ORIGIN_NOT_ALLOWED',
  NOT_FOUND: 'NOT_FOUND',
  CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  CATEGORY_NAME_TAKEN: 'CATEGORY_NAME_TAKEN',
  CATEGORY_IN_USE: 'CATEGORY_IN_USE',
  PARENT_ARCHIVED: 'PARENT_ARCHIVED',
  CATEGORY_LIMIT_REACHED: 'CATEGORY_LIMIT_REACHED',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'The request payload failed validation',
  INVALID_JSON: 'Malformed JSON payload received',
  CONSTRAINT_VIOLATION: 'Database constraint violation',
  CURRENT_PASSWORD_INCORRECT: 'Current password provided is incorrect',
  SAME_PASSWORD: 'New password cannot be identical to current password',
  INVALID_REASSIGN_TARGET: 'Target category for reassignment is invalid',
  INVALID_PARENT: 'Invalid parent category specified',
  UNAUTHORIZED: 'Authentication required to access this resource',
  TOKEN_EXPIRED: 'Access token has expired',
  INVALID_CREDENTIALS: 'Invalid email or password',
  REFRESH_TOKEN_MISSING: 'Refresh token cookie is missing',
  INVALID_REFRESH_TOKEN: 'Refresh token is invalid or expired',
  REFRESH_TOKEN_REUSED: 'Refresh token reuse detected; all sessions revoked',
  ORIGIN_NOT_ALLOWED: 'Origin header is not permitted',
  NOT_FOUND: 'Requested resource was not found',
  CATEGORY_NOT_FOUND: 'Category not found',
  ROUTE_NOT_FOUND: 'Requested route does not exist',
  EMAIL_TAKEN: 'An account with this email address already exists',
  CATEGORY_NAME_TAKEN: 'A category with this name already exists for this type',
  CATEGORY_IN_USE:
    'Category is in use by transactions or recurring rules and cannot be deleted without reassignment',
  PARENT_ARCHIVED: 'Cannot perform operation because parent category is archived',
  CATEGORY_LIMIT_REACHED: 'Maximum number of categories allowed has been reached',
  CONFLICT: 'Resource conflict occurred',
  PAYLOAD_TOO_LARGE: 'Request payload exceeds size limit',
  RATE_LIMITED: 'Too many requests; please try again later',
  INTERNAL_ERROR: 'An unexpected internal server error occurred'
};

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;

  constructor(statusCode: number, code: ErrorCode, message?: string, details?: unknown) {
    super(message || ERROR_MESSAGES[code] || 'An error occurred');
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static badRequest(code: ErrorCode, message?: string, details?: unknown): ApiError {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(
    code: ErrorCode = ERROR_CODES.UNAUTHORIZED,
    message?: string,
    details?: unknown
  ): ApiError {
    return new ApiError(401, code, message, details);
  }

  static forbidden(
    code: ErrorCode = ERROR_CODES.ORIGIN_NOT_ALLOWED,
    message?: string,
    details?: unknown
  ): ApiError {
    return new ApiError(403, code, message, details);
  }

  static notFound(
    code: ErrorCode = ERROR_CODES.NOT_FOUND,
    message?: string,
    details?: unknown
  ): ApiError {
    return new ApiError(404, code, message, details);
  }

  static conflict(
    code: ErrorCode = ERROR_CODES.CONFLICT,
    message?: string,
    details?: unknown
  ): ApiError {
    return new ApiError(409, code, message, details);
  }

  static tooMany(
    code: ErrorCode = ERROR_CODES.RATE_LIMITED,
    message?: string,
    details?: unknown
  ): ApiError {
    return new ApiError(429, code, message, details);
  }
}
