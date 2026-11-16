import { Frequency } from '@prisma/client';
import {
  addDays,
  addMonthsClamped,
  addYearsClamped,
  DAYS_PER_WEEK,
  diffDays,
  formatYmd,
  MONTHS_PER_YEAR,
  parseYmd
} from './dates';

/**
 * Computes the n-th occurrence of a recurring rule anchored strictly from startDate.
 * Grid occurrences are ALWAYS computed from startDate + n * period to avoid drift.
 */
export function occurrenceAt(start: Date, frequency: Frequency, n: number): Date {
  switch (frequency) {
    case Frequency.DAILY:
      return addDays(start, n);
    case Frequency.WEEKLY:
      return addDays(start, n * DAYS_PER_WEEK);
    case Frequency.MONTHLY:
      return addMonthsClamped(start, n);
    case Frequency.YEARLY:
      return addYearsClamped(start, n);
    default: {
      const _exhaustive: never = frequency;
      throw new Error(`Unhandled frequency: ${_exhaustive}`);
    }
  }
}

/**
 * Finds the smallest grid index n >= 0 such that occurrenceAt(start, frequency, n) >= target.
 */
export function indexOnOrAfter(start: Date, frequency: Frequency, target: Date): number {
  if (target.getTime() <= start.getTime()) {
    return 0;
  }

  // Initial estimate to reduce loop iterations
  let n = 0;
  switch (frequency) {
    case Frequency.DAILY:
      n = Math.max(0, diffDays(start, target));
      break;
    case Frequency.WEEKLY:
      n = Math.max(0, Math.floor(diffDays(start, target) / DAYS_PER_WEEK));
      break;
    case Frequency.MONTHLY:
      n = Math.max(
        0,
        (target.getUTCFullYear() - start.getUTCFullYear()) * MONTHS_PER_YEAR +
          (target.getUTCMonth() - start.getUTCMonth())
      );
      break;
    case Frequency.YEARLY:
      n = Math.max(0, target.getUTCFullYear() - start.getUTCFullYear());
      break;
  }

  // Refine bounds
  while (n > 0 && occurrenceAt(start, frequency, n - 1).getTime() >= target.getTime()) {
    n--;
  }
  while (occurrenceAt(start, frequency, n).getTime() < target.getTime()) {
    n++;
  }

  return n;
}

/**
 * Computes the first grid occurrence on or after the target date.
 */
export function nextOccurrenceOnOrAfter(start: Date, frequency: Frequency, target: Date): Date {
  const idx = indexOnOrAfter(start, frequency, target);
  return occurrenceAt(start, frequency, idx);
}

/**
 * Computes the first grid occurrence strictly after the given date.
 */
export function nextOccurrenceAfter(start: Date, frequency: Frequency, after: Date): Date {
  let n = indexOnOrAfter(start, frequency, after);
  if (occurrenceAt(start, frequency, n).getTime() <= after.getTime()) {
    n++;
  }
  return occurrenceAt(start, frequency, n);
}

/**
 * Computes due occurrences up to today and maxCount, advancing nextRunDate and detecting completion.
 */
export function dueOccurrences(
  rule: {
    startDate: Date;
    frequency: Frequency;
    nextRunDate: Date;
    endDate: Date | null;
  },
  today: string | Date,
  maxCount: number
): { dates: Date[]; nextRunDate: Date; completed: boolean } {
  const todayDate = typeof today === 'string' ? parseYmd(today) : today;
  let n = indexOnOrAfter(rule.startDate, rule.frequency, rule.nextRunDate);

  const dates: Date[] = [];
  while (dates.length < maxCount) {
    const dt = occurrenceAt(rule.startDate, rule.frequency, n);
    if (dt.getTime() > todayDate.getTime()) {
      break;
    }
    if (rule.endDate && dt.getTime() > rule.endDate.getTime()) {
      break;
    }
    dates.push(dt);
    n++;
  }

  const nextGridDate = occurrenceAt(rule.startDate, rule.frequency, n);
  const completed = rule.endDate !== null && nextGridDate.getTime() > rule.endDate.getTime();

  return {
    dates,
    nextRunDate: nextGridDate,
    completed
  };
}

/**
 * Generates the upcoming preview occurrences starting from nextRunDate, bounded by endDate and count.
 */
export function upcomingOccurrences(
  rule: {
    startDate: Date;
    frequency: Frequency;
    nextRunDate: Date;
    endDate: Date | null;
  },
  count: number
): string[] {
  let n = indexOnOrAfter(rule.startDate, rule.frequency, rule.nextRunDate);
  const result: string[] = [];
  while (result.length < count) {
    const dt = occurrenceAt(rule.startDate, rule.frequency, n);
    if (rule.endDate && dt.getTime() > rule.endDate.getTime()) {
      break;
    }
    result.push(formatYmd(dt));
    n++;
  }
  return result;
}

/**
 * Derives the active/paused/completed lifecycle status of a recurring rule.
 */
export function deriveRuleStatus(rule: {
  isActive: boolean;
  endDate: Date | null;
  nextRunDate: Date;
}): 'active' | 'paused' | 'completed' {
  if (rule.endDate !== null && rule.nextRunDate.getTime() > rule.endDate.getTime()) {
    return 'completed';
  }
  return rule.isActive ? 'active' : 'paused';
}
