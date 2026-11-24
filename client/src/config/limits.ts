/**
 * FinTrack Application Limits & Policy Constants
 * 
 * Mirrors server limits from server/src/config/limits.ts.
 * Any divergence is caught by the parity smoke test.
 */

// mirrors server limits.ts: MONEY_PRECISION
export const MONEY_PRECISION = 12;
// mirrors server limits.ts: MONEY_SCALE
export const MONEY_SCALE = 2;

// mirrors server limits.ts: USER.NAME_MIN_LENGTH
export const USER_NAME_MIN_LENGTH = 1;
// mirrors server limits.ts: USER.NAME_MAX_LENGTH
export const USER_NAME_MAX_LENGTH = 60;
// mirrors server limits.ts: USER.EMAIL_MAX_LENGTH
export const USER_EMAIL_MAX_LENGTH = 254;
// mirrors server limits.ts: USER.CURRENCY_LENGTH
export const USER_CURRENCY_LENGTH = 3;
// mirrors server limits.ts: USER.ALERT_THRESHOLDS_MIN_COUNT
export const ALERT_THRESHOLDS_MIN_COUNT = 1;
// mirrors server limits.ts: USER.ALERT_THRESHOLDS_MAX_COUNT
export const ALERT_THRESHOLDS_MAX_COUNT = 5;
// mirrors server limits.ts: USER.ALERT_THRESHOLD_MIN_VALUE
export const ALERT_THRESHOLD_MIN_VALUE = 1;
// mirrors server limits.ts: USER.ALERT_THRESHOLD_MAX_VALUE
export const ALERT_THRESHOLD_MAX_VALUE = 100;

// mirrors server limits.ts: PASSWORD.MIN_LENGTH
export const PASSWORD_MIN_LENGTH = 8;
// mirrors server limits.ts: PASSWORD.MAX_LENGTH
export const PASSWORD_MAX_LENGTH = 72;
// mirrors server limits.ts: PASSWORD.MAX_BYTES
export const PASSWORD_MAX_BYTES = 72;
// mirrors server limits.ts: PASSWORD.LOGIN_MAX_LENGTH
export const PASSWORD_LOGIN_MAX_LENGTH = 128;

// mirrors server limits.ts: CATEGORY.NAME_MIN_LENGTH
export const CATEGORY_NAME_MIN_LENGTH = 1;
// mirrors server limits.ts: CATEGORY.NAME_MAX_LENGTH
export const CATEGORY_NAME_MAX_LENGTH = 40;
// mirrors server limits.ts: CATEGORY.COLOR_REGEX
export const CATEGORY_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
// mirrors server limits.ts: CATEGORY.ICON_REGEX
export const CATEGORY_ICON_REGEX = /^[a-z0-9-]+$/;
// mirrors server limits.ts: CATEGORY.ICON_MAX_LENGTH
export const CATEGORY_ICON_MAX_LENGTH = 40;
// mirrors server limits.ts: CATEGORY.MAX_PER_USER
export const CATEGORY_MAX_PER_USER = 50;
// mirrors server limits.ts: CATEGORY.MAX_TREE_DEPTH
export const CATEGORY_MAX_TREE_DEPTH = 2;

// mirrors server limits.ts: PAGINATION.DEFAULT_PAGE
export const PAGINATION_DEFAULT_PAGE = 1;
// mirrors server limits.ts: PAGINATION.DEFAULT_PAGE_SIZE
export const PAGINATION_DEFAULT_PAGE_SIZE = 20;
// mirrors server limits.ts: PAGINATION.MAX_PAGE_SIZE
export const PAGINATION_MAX_PAGE_SIZE = 100;

export const LIMITS = {
  MONEY: {
    PRECISION: MONEY_PRECISION, // mirrors server limits.ts: MONEY_PRECISION
    SCALE: MONEY_SCALE // mirrors server limits.ts: MONEY_SCALE
  },
  USER: {
    NAME_MIN_LENGTH: USER_NAME_MIN_LENGTH, // mirrors server limits.ts: USER.NAME_MIN_LENGTH
    NAME_MAX_LENGTH: USER_NAME_MAX_LENGTH, // mirrors server limits.ts: USER.NAME_MAX_LENGTH
    EMAIL_MAX_LENGTH: USER_EMAIL_MAX_LENGTH, // mirrors server limits.ts: USER.EMAIL_MAX_LENGTH
    CURRENCY_LENGTH: USER_CURRENCY_LENGTH, // mirrors server limits.ts: USER.CURRENCY_LENGTH
    ALERT_THRESHOLDS_MIN_COUNT: ALERT_THRESHOLDS_MIN_COUNT, // mirrors server limits.ts: USER.ALERT_THRESHOLDS_MIN_COUNT
    ALERT_THRESHOLDS_MAX_COUNT: ALERT_THRESHOLDS_MAX_COUNT, // mirrors server limits.ts: USER.ALERT_THRESHOLDS_MAX_COUNT
    ALERT_THRESHOLD_MIN_VALUE: ALERT_THRESHOLD_MIN_VALUE, // mirrors server limits.ts: USER.ALERT_THRESHOLD_MIN_VALUE
    ALERT_THRESHOLD_MAX_VALUE: ALERT_THRESHOLD_MAX_VALUE // mirrors server limits.ts: USER.ALERT_THRESHOLD_MAX_VALUE
  },
  PASSWORD: {
    MIN_LENGTH: PASSWORD_MIN_LENGTH, // mirrors server limits.ts: PASSWORD.MIN_LENGTH
    MAX_LENGTH: PASSWORD_MAX_LENGTH, // mirrors server limits.ts: PASSWORD.MAX_LENGTH
    MAX_BYTES: PASSWORD_MAX_BYTES, // mirrors server limits.ts: PASSWORD.MAX_BYTES
    LOGIN_MAX_LENGTH: PASSWORD_LOGIN_MAX_LENGTH // mirrors server limits.ts: PASSWORD.LOGIN_MAX_LENGTH
  },
  CATEGORY: {
    NAME_MIN_LENGTH: CATEGORY_NAME_MIN_LENGTH, // mirrors server limits.ts: CATEGORY.NAME_MIN_LENGTH
    NAME_MAX_LENGTH: CATEGORY_NAME_MAX_LENGTH, // mirrors server limits.ts: CATEGORY.NAME_MAX_LENGTH
    COLOR_REGEX: CATEGORY_COLOR_REGEX, // mirrors server limits.ts: CATEGORY.COLOR_REGEX
    ICON_REGEX: CATEGORY_ICON_REGEX, // mirrors server limits.ts: CATEGORY.ICON_REGEX
    ICON_MAX_LENGTH: CATEGORY_ICON_MAX_LENGTH, // mirrors server limits.ts: CATEGORY.ICON_MAX_LENGTH
    MAX_PER_USER: CATEGORY_MAX_PER_USER, // mirrors server limits.ts: CATEGORY.MAX_PER_USER
    MAX_TREE_DEPTH: CATEGORY_MAX_TREE_DEPTH // mirrors server limits.ts: CATEGORY.MAX_TREE_DEPTH
  },
  PAGINATION: {
    DEFAULT_PAGE: PAGINATION_DEFAULT_PAGE, // mirrors server limits.ts: PAGINATION.DEFAULT_PAGE
    DEFAULT_PAGE_SIZE: PAGINATION_DEFAULT_PAGE_SIZE, // mirrors server limits.ts: PAGINATION.DEFAULT_PAGE_SIZE
    MAX_PAGE_SIZE: PAGINATION_MAX_PAGE_SIZE // mirrors server limits.ts: PAGINATION.MAX_PAGE_SIZE
  }
} as const;
