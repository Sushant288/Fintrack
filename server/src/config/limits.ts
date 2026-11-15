/**
 * FinTrack Application Limits & Policy Constants
 * 
 * Each constant here corresponds to a business policy or directly mirrors
 * a PostgreSQL CHECK constraint from Phase 1 migrations.
 */

export const LIMITS = {
  USER: {
    // Mirrors User_name_chk: CHECK (char_length(btrim(name)) BETWEEN 1 AND 60)
    NAME_MIN_LENGTH: 1,
    NAME_MAX_LENGTH: 60,

    // Mirrors User.email @db.VarChar(254)
    EMAIL_MAX_LENGTH: 254,

    // Mirrors User_currency_chk: CHECK (currency ~ '^[A-Z]{3}$')
    CURRENCY_LENGTH: 3,

    // Mirrors User_alertThresholds_chk: cardinality between 1 and 5, values 1 to 100
    ALERT_THRESHOLDS_MIN_COUNT: 1,
    ALERT_THRESHOLDS_MAX_COUNT: 5,
    ALERT_THRESHOLD_MIN_VALUE: 1,
    ALERT_THRESHOLD_MAX_VALUE: 100
  },

  PASSWORD: {
    // Password policy for registration and change password
    MIN_LENGTH: 8,
    MAX_LENGTH: 72,
    // Bcrypt silently truncates at 72 bytes; enforce strict byte ceiling to reject multi-byte truncation
    MAX_BYTES: 72,
    // Sane ceiling for login attempt input without leaking validation policy
    LOGIN_MAX_LENGTH: 128
  },

  CATEGORY: {
    // Mirrors Category_name_chk: CHECK (char_length(btrim(name)) BETWEEN 1 AND 40)
    NAME_MIN_LENGTH: 1,
    NAME_MAX_LENGTH: 40,

    // Mirrors Category_color_chk: CHECK (color ~ '^#[0-9a-fA-F]{6}$')
    COLOR_REGEX: /^#[0-9a-fA-F]{6}$/,

    // Mirrors Category.icon @db.VarChar(40)
    ICON_REGEX: /^[a-z0-9-]+$/,
    ICON_MAX_LENGTH: 40,

    // Max categories allowed per user account
    MAX_PER_USER: 50,

    // Prisma transaction timeout for removal and reassignments (ms)
    REMOVAL_TRANSACTION_TIMEOUT_MS: 15000,

    // Tree depth maximum (top-level and 1 child level)
    MAX_TREE_DEPTH: 2
  },

  PAGINATION: {
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100
  }
} as const;
