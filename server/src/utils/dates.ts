/**
 * FinTrack Date Utilities
 * 
 * Pure helpers operating on "YYYY-MM-DD" date-only strings and UTC-midnight Dates.
 */

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
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
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
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
export function todayInTimeZone(tz: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  const day = parts.find((p) => p.type === 'day')!.value;
  return `${year}-${month}-${day}`;
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
  if (month === 12) {
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
    return { year: year - 1, month: 12 };
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
