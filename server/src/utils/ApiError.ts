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
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  // Module B2 error codes
  DATE_IN_FUTURE: 'DATE_IN_FUTURE',
  DATE_TOO_OLD: 'DATE_TOO_OLD',
  CATEGORY_TYPE_MISMATCH: 'CATEGORY_TYPE_MISMATCH',
  CATEGORY_ARCHIVED: 'CATEGORY_ARCHIVED',
  INVALID_BUDGET_COPY: 'INVALID_BUDGET_COPY',
  TRANSACTION_NOT_FOUND: 'TRANSACTION_NOT_FOUND',
  BUDGET_NOT_FOUND: 'BUDGET_NOT_FOUND',
  ALERT_NOT_FOUND: 'ALERT_NOT_FOUND',

  // Module B3 error codes
  RULE_NOT_FOUND: 'RULE_NOT_FOUND',
  GOAL_NOT_FOUND: 'GOAL_NOT_FOUND',
  RULE_COMPLETED: 'RULE_COMPLETED',
  RULE_ALREADY_STARTED: 'RULE_ALREADY_STARTED',
  RULE_LIMIT_REACHED: 'RULE_LIMIT_REACHED',
  GOAL_LIMIT_REACHED: 'GOAL_LIMIT_REACHED',
  GOAL_ARCHIVED: 'GOAL_ARCHIVED',
  INSUFFICIENT_GOAL_FUNDS: 'INSUFFICIENT_GOAL_FUNDS',
  INVALID_DEADLINE: 'INVALID_DEADLINE',
  DATE_TOO_FAR_FUTURE: 'DATE_TOO_FAR_FUTURE',

  // Module B4 error codes
  IMPORT_FILE_REQUIRED: 'IMPORT_FILE_REQUIRED',
  IMPORT_FILE_INVALID: 'IMPORT_FILE_INVALID',
  IMPORT_FILE_EMPTY: 'IMPORT_FILE_EMPTY',
  IMPORT_ROW_LIMIT_EXCEEDED: 'IMPORT_ROW_LIMIT_EXCEEDED',
  IMPORT_INVALID_MAPPING: 'IMPORT_INVALID_MAPPING',
  IMPORT_BATCH_NOT_FOUND: 'IMPORT_BATCH_NOT_FOUND',
  IMPORT_CANNOT_UNDO: 'IMPORT_CANNOT_UNDO',
  EXPORT_TOO_LARGE: 'EXPORT_TOO_LARGE',
  REPORT_NOT_FOUND: 'REPORT_NOT_FOUND',
  REPORT_YEAR_INVALID: 'REPORT_YEAR_INVALID',
  REPORT_MONTH_INVALID: 'REPORT_MONTH_INVALID',
  RANGE_TOO_LARGE: 'RANGE_TOO_LARGE'
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
  INTERNAL_ERROR: 'An unexpected internal server error occurred',

  // Module B2 error messages
  DATE_IN_FUTURE: 'Transaction date cannot be in the future',
  DATE_TOO_OLD: 'Transaction date is further in the past than allowed',
  CATEGORY_TYPE_MISMATCH: 'Category transaction type does not match transaction type',
  CATEGORY_ARCHIVED: 'Archived category cannot be used for new operations',
  INVALID_BUDGET_COPY: 'Source and target budget periods cannot be identical',
  TRANSACTION_NOT_FOUND: 'Transaction not found',
  BUDGET_NOT_FOUND: 'Budget not found',
  ALERT_NOT_FOUND: 'Alert not found',

  // Module B3 error messages
  RULE_NOT_FOUND: 'Recurring rule not found',
  GOAL_NOT_FOUND: 'Savings goal not found',
  RULE_COMPLETED: 'Recurring rule is completed and cannot be modified or resumed',
  RULE_ALREADY_STARTED: 'Start date cannot be modified after transactions have been generated',
  RULE_LIMIT_REACHED: 'Maximum number of recurring rules reached',
  GOAL_LIMIT_REACHED: 'Maximum number of savings goals reached',
  GOAL_ARCHIVED: 'Archived savings goal cannot be modified or receive contributions',
  INSUFFICIENT_GOAL_FUNDS: 'Withdrawal amount exceeds available savings goal balance',
  INVALID_DEADLINE: 'Goal deadline must be after today',
  DATE_TOO_FAR_FUTURE: 'Start date is too far in the future',

  // Module B4 error messages
  IMPORT_FILE_REQUIRED: 'No file was uploaded',
  IMPORT_FILE_INVALID: 'Uploaded file is not a valid CSV file',
  IMPORT_FILE_EMPTY: 'CSV file contains no data rows',
  IMPORT_ROW_LIMIT_EXCEEDED: 'CSV file exceeds maximum row limit',
  IMPORT_INVALID_MAPPING: 'Invalid or incomplete column mapping',
  IMPORT_BATCH_NOT_FOUND: 'Import batch not found',
  IMPORT_CANNOT_UNDO: 'Import batch cannot be undone',
  EXPORT_TOO_LARGE: 'Export row count exceeds maximum allowed limit',
  REPORT_NOT_FOUND: 'Report not found',
  REPORT_YEAR_INVALID: 'Invalid report year requested',
  REPORT_MONTH_INVALID: 'Invalid report month requested',
  RANGE_TOO_LARGE: 'Date range requested exceeds allowed maximum'
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
