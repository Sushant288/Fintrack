export const TIMING = {
  REFRESH_SKEW_MS: 60 * 1000, // 1 minute before token expiry
  REQUEST_TIMEOUT_MS: 15000, // 15 seconds
  TOAST_DURATION_MS: 5000, // 5 seconds
  QUERY_STALE_TIME_MS: 60 * 1000, // 1 minute
  QUERY_GC_TIME_MS: 5 * 60 * 1000, // 5 minutes
  MAX_RETRY_COUNT: 2,
  DEBOUNCE_SEARCH_MS: 300,
  DEFAULT_LOCKOUT_RETRY_AFTER_SEC: 60,
  MAX_VISIBLE_TOASTS: 3
} as const;
