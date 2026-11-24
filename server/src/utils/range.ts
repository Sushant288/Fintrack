import { LIMITS } from '../config/limits';
import { ApiError, ERROR_CODES } from './ApiError';
import {
  addDays,
  diffDays,
  formatYmd,
  parseYmd,
  todayInTimeZone
} from './dates';

export type RangePreset =
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_year'
  | 'last_year'
  | 'last_30_days'
  | 'last_90_days'
  | 'last_12_months'
  | 'custom';

export interface DateRange {
  from: string;
  to: string;
}

/**
 * Resolves a date range preset or explicit from/to parameters relative to a user's local timezone.
 */
export function resolveRange(
  query: { range?: string; from?: string; to?: string },
  userTimezone: string
): DateRange {
  const todayYmd = todayInTimeZone(userTimezone);
  const [currentYear, currentMonth, currentDay] = todayYmd.split('-').map(Number);

  if (query.range && query.range !== 'custom') {
    switch (query.range) {
      case 'this_month': {
        const from = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
        return { from, to: todayYmd };
      }
      case 'last_month': {
        const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
        const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
        const from = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
        const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
        const to = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        return { from, to };
      }
      case 'this_quarter': {
        const quarterStartMonth = Math.floor((currentMonth - 1) / 3) * 3 + 1;
        const from = `${currentYear}-${String(quarterStartMonth).padStart(2, '0')}-01`;
        return { from, to: todayYmd };
      }
      case 'last_quarter': {
        let prevQEndMonth = Math.floor((currentMonth - 1) / 3) * 3;
        let prevQYear = currentYear;
        if (prevQEndMonth === 0) {
          prevQEndMonth = 12;
          prevQYear -= 1;
        }
        const prevQStartMonth = prevQEndMonth - 2;
        const from = `${prevQYear}-${String(prevQStartMonth).padStart(2, '0')}-01`;
        const lastDay = new Date(Date.UTC(prevQYear, prevQEndMonth, 0)).getUTCDate();
        const to = `${prevQYear}-${String(prevQEndMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        return { from, to };
      }
      case 'this_year': {
        const from = `${currentYear}-01-01`;
        return { from, to: todayYmd };
      }
      case 'last_year': {
        const prevYear = currentYear - 1;
        return { from: `${prevYear}-01-01`, to: `${prevYear}-12-31` };
      }
      case 'last_30_days': {
        const todayDate = parseYmd(todayYmd);
        const fromDate = addDays(todayDate, -29);
        return { from: formatYmd(fromDate), to: todayYmd };
      }
      case 'last_90_days': {
        const todayDate = parseYmd(todayYmd);
        const fromDate = addDays(todayDate, -89);
        return { from: formatYmd(fromDate), to: todayYmd };
      }
      case 'last_12_months': {
        // From 1st of month 11 months ago to today
        const dt = new Date(Date.UTC(currentYear, currentMonth - 12, 1));
        const from = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-01`;
        return { from, to: todayYmd };
      }
    }
  }

  // Explicit from / to or fallback to this month
  const from = query.from ?? `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
  const to = query.to ?? todayYmd;

  if (from > to) {
    throw ApiError.badRequest(ERROR_CODES.VALIDATION_ERROR, 'from date cannot be after to date');
  }

  return { from, to };
}

/**
 * Computes the immediately preceding comparative period with matching calendar length.
 */
export function previousPeriod(from: string, to: string): DateRange {
  const fromDate = parseYmd(from);
  const toDate = parseYmd(to);
  const durationDays = diffDays(fromDate, toDate) + 1;

  const prevEndDate = addDays(fromDate, -1);
  const prevStartDate = addDays(prevEndDate, -(durationDays - 1));

  return {
    from: formatYmd(prevStartDate),
    to: formatYmd(prevEndDate)
  };
}
