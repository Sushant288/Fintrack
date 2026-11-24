import { LIMITS } from '../config/limits';

/**
 * FinTrack Date Utilities
 * 
 * Pure helpers operating on "YYYY-MM-DD" date-only strings and UTC-midnight Dates.
 */

// Calendar constants (named to prevent magic numbers across modules)
export const DAYS_PER_WEEK = 7;
export const MONTHS_PER_YEAR = 12;
export const MAX_TZ_LEAD_DAYS = 1;
export const MILLISECONDS_PER_DAY = 86_400_000;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Returns the number of days in the specified year and month (1-12).
 */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Validates strict YYYY-MM-DD format and performs a round-trip check
 * to reject non-existent calendar dates (e.g. 2026-02-30).
 */
export function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [yStr, mStr, dStr] = s.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (m < 1 || m > MONTHS_PER_YEAR || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * Converts a valid YYYY-MM-DD string into a UTC-midnight Date (00:00:00.000Z).
 */
export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

/**
 * Formats a Date object into a "YYYY-MM-DD" string using its UTC parts.
 */
export function formatYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Computes the "YYYY-MM-DD" representation of "now" in the specified IANA timezone.
 * Uses Intl.DateTimeFormat formatToParts to avoid locale-string parsing bugs.
 */
export function todayInTimeZone(tz: string, now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  const day = parts.find((p) => p.type === 'day')!.value;
  return `${year}-${month}-${day}`;
}

/**
 * Adds n whole calendar days to a UTC-midnight Date.
 */
export function addDays(date: Date, n: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + n, 0, 0, 0, 0));
}

/**
 * Adds n calendar months to a UTC-midnight Date, preserving the original day-of-month,
 * clamped to the target month's maximum length.
 */
export function addMonthsClamped(date: Date, n: number): Date {
  const targetYear = date.getUTCFullYear() + Math.floor((date.getUTCMonth() + n) / MONTHS_PER_YEAR);
  const targetMonthIndex = ((date.getUTCMonth() + n) % MONTHS_PER_YEAR + MONTHS_PER_YEAR) % MONTHS_PER_YEAR;
  const targetMonthNumber = targetMonthIndex + 1;
  const maxDays = daysInMonth(targetYear, targetMonthNumber);
  const targetDay = Math.min(date.getUTCDate(), maxDays);
  return new Date(Date.UTC(targetYear, targetMonthIndex, targetDay, 0, 0, 0, 0));
}

/**
 * Adds n calendar years to a UTC-midnight Date, clamping Feb 29 to Feb 28 in non-leap years.
 */
export function addYearsClamped(date: Date, n: number): Date {
  const targetYear = date.getUTCFullYear() + n;
  const targetMonthIndex = date.getUTCMonth();
  const targetMonthNumber = targetMonthIndex + 1;
  let targetDay = date.getUTCDate();
  if (targetMonthNumber === 2 && targetDay === 29 && !isLeapYear(targetYear)) {
    targetDay = 28;
  }
  return new Date(Date.UTC(targetYear, targetMonthIndex, targetDay, 0, 0, 0, 0));
}

/**
 * Computes whole calendar days between two UTC Dates (b - a).
 */
export function diffDays(a: Date, b: Date): number {
  const utcA = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const utcB = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((utcB - utcA) / MILLISECONDS_PER_DAY);
}

/**
 * Computes whole calendar months between two "YYYY-MM-DD" dates.
 * Adds +1 when deadline's day-of-month is later than today's (partial month counts as one installment).
 * Minimum 1 when deadline is after today.
 */
export function calendarMonthsUntil(todayYmd: string, deadlineYmd: string): number {
  const [y1, m1, d1] = todayYmd.split('-').map(Number);
  const [y2, m2, d2] = deadlineYmd.split('-').map(Number);
  let months = (y2 - y1) * MONTHS_PER_YEAR + (m2 - m1);
  if (d2 > d1) {
    months += 1;
  }
  if (deadlineYmd > todayYmd && months < 1) {
    months = 1;
  }
  return months;
}

/**
 * Adds n calendar years to a YYYY-MM-DD string, clamping Feb 29 to Feb 28
 * if the resulting year is not a leap year.
 */
export function addYears(ymd: string, n: number): string {
  const [yStr, mStr, dStr] = ymd.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  let d = Number(dStr);
  const targetYear = y + n;
  if (m === 2 && d === 29 && !isLeapYear(targetYear)) {
    d = 28;
  }
  return `${targetYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Subtracts n calendar years from a YYYY-MM-DD string, clamping Feb 29 to Feb 28
 * if the resulting year is not a leap year.
 */
export function subtractYears(ymd: string, n: number): string {
  const [yStr, mStr, dStr] = ymd.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  let d = Number(dStr);
  const targetYear = y - n;
  if (m === 2 && d === 29 && !isLeapYear(targetYear)) {
    d = 28;
  }
  return `${targetYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Returns UTC-midnight bounds { start, endExclusive } for a given year and month (1-12).
 * Month filters use start <= date < endExclusive.
 */
export function monthRange(year: number, month: number): { start: Date; endExclusive: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  let endExclusive: Date;
  if (month === MONTHS_PER_YEAR) {
    endExclusive = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0));
  } else {
    endExclusive = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  }
  return { start, endExclusive };
}

/**
 * Returns the calendar month preceding the given (year, month), handling Jan -> Dec rollover.
 */
export function previousMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) {
    return { year: year - 1, month: MONTHS_PER_YEAR };
  }
  return { year, month: month - 1 };
}

/**
 * Formats a given (year, month) into a long month name and year (e.g. "February 2026")
 * evaluated in UTC.
 */
export function monthLabel(year: number, month: number, locale = 'en-US'): string {
  const dt = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(dt);
}

/**
 * Checks if a transaction date is within valid bounds relative to today in the user's timezone.
 * Returns 'DATE_IN_FUTURE' if ymd > todayYmd, 'DATE_TOO_OLD' if older than maxPastYears, or null if valid.
 */
export function dateBoundsError(
  ymd: string,
  todayYmd: string,
  maxPastYears = LIMITS.TRANSACTION.MAX_PAST_YEARS
): 'DATE_IN_FUTURE' | 'DATE_TOO_OLD' | null {
  if (ymd > todayYmd) {
    return 'DATE_IN_FUTURE';
  }
  const minAllowed = subtractYears(todayYmd, maxPastYears);
  if (ymd < minAllowed) {
    return 'DATE_TOO_OLD';
  }
  return null;
}

/**
 * Computes the exact UTC Date corresponding to midnight (00:00:00) on a given YYYY-MM-DD in timezone tz.
 * Handles DST shifts cleanly using a 2-pass adjustment.
 */
export function zonedMidnightToUtc(tz: string, ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  let utcMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0);

  const getLocalParts = (ms: number) => {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(new Date(ms));
    const findPart = (type: string) => {
      const v = parts.find((p) => p.type === type)?.value || '0';
      return v === '24' ? 0 : Number(v);
    };
    const py = findPart('year');
    const pm = findPart('month');
    const pd = findPart('day');
    const ph = findPart('hour');
    const pmin = findPart('minute');
    const ps = findPart('second');
    return Date.UTC(py, pm - 1, pd, ph, pmin, ps, 0);
  };

  const targetLocalMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  // Pass 1
  let localMs = getLocalParts(utcMs);
  let diff = localMs - targetLocalMs;
  utcMs -= diff;

  // Pass 2 (DST shift correction)
  localMs = getLocalParts(utcMs);
  diff = localMs - targetLocalMs;
  utcMs -= diff;

  return new Date(utcMs);
}

/**
 * Returns UTC instant bounds [start, endExclusive) for a given calendar month in timezone tz.
 */
export function monthInstantRange(
  tz: string,
  year: number,
  month: number
): { start: Date; endExclusive: Date } {
  const startYmd = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonthYear = month === MONTHS_PER_YEAR ? year + 1 : year;
  const nextMonthNum = month === MONTHS_PER_YEAR ? 1 : month + 1;
  const endYmd = `${nextMonthYear}-${String(nextMonthNum).padStart(2, '0')}-01`;

  return {
    start: zonedMidnightToUtc(tz, startYmd),
    endExclusive: zonedMidnightToUtc(tz, endYmd)
  };
}

/**
 * Returns the current local hour (0-23) in timezone tz for a given instant.
 */
export function localHour(tz: string, now: Date = new Date()): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: false
  });
  const val = formatter.format(now);
  const n = Number(val);
  return n === 24 ? 0 : n;
}

/**
 * Returns the Monday YYYY-MM-DD of the week containing the given date.
 */
export function weekStart(ymd: string): string {
  const dt = parseYmd(ymd);
  const day = dt.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const offset = day === 0 ? -6 : 1 - day;
  return formatYmd(addDays(dt, offset));
}

/**
 * Generates all calendar dates between from and to inclusive as YYYY-MM-DD strings.
 */
export function eachDay(from: string, to: string): string[] {
  const dates: string[] = [];
  let cur = parseYmd(from);
  const end = parseYmd(to);
  while (cur <= end) {
    dates.push(formatYmd(cur));
    cur = addDays(cur, 1);
  }
  return dates;
}

/**
 * Generates Monday YYYY-MM-DD strings for each week between from and to inclusive.
 */
export function eachWeekStart(from: string, to: string): string[] {
  const start = weekStart(from);
  const end = weekStart(to);
  const weeks: string[] = [];
  let cur = parseYmd(start);
  const endDt = parseYmd(end);
  while (cur <= endDt) {
    weeks.push(formatYmd(cur));
    cur = addDays(cur, DAYS_PER_WEEK);
  }
  return weeks;
}

/**
 * Generates an array of months between fromYm and toYm inclusive ("YYYY-MM").
 */
export function eachMonth(
  fromYm: string,
  toYm: string
): { year: number; month: number; key: string }[] {
  const [startY, startM] = fromYm.split('-').map(Number);
  const [endY, endM] = toYm.split('-').map(Number);
  const months: { year: number; month: number; key: string }[] = [];
  let y = startY;
  let m = startM;
  while (y < endY || (y === endY && m <= endM)) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    months.push({ year: y, month: m, key });
    m++;
    if (m > MONTHS_PER_YEAR) {
      m = 1;
      y++;
    }
  }
  return months;
}
