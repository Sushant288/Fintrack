import { Prisma } from '@prisma/client';
import { LIMITS } from '../config/limits';

/**
 * FinTrack Money Calculation Utilities
 * 
 * Uses Prisma.Decimal exclusively for all monetary arithmetic.
 */

/**
 * Parses and validates an input money string or number into a Prisma.Decimal.
 * Throws an Error if the input is non-numeric, non-positive, or exceeds LIMITS.MONEY.MAX.
 */
export function parseMoney(input: string | number): Prisma.Decimal {
  const str = typeof input === 'number' ? String(input) : input.trim();
  if (!LIMITS.MONEY.REGEX.test(str)) {
    throw new Error(`Invalid money format: "${input}"`);
  }

  const d = new Prisma.Decimal(str);
  if (d.isNaN() || !d.isFinite() || d.isNegative() || d.isZero()) {
    throw new Error(`Money amount must be strictly positive: "${input}"`);
  }

  const maxDecimal = new Prisma.Decimal(LIMITS.MONEY.MAX);
  if (d.gt(maxDecimal)) {
    throw new Error(`Money amount exceeds maximum allowed (${LIMITS.MONEY.MAX}): "${input}"`);
  }

  return d;
}

/**
 * Formats a Prisma.Decimal (or numeric/string representation) to a fixed string
 * with exactly LIMITS.MONEY.SCALE decimal places (e.g. "1234.50").
 */
export function formatMoney(d: Prisma.Decimal | string | number): string {
  const dec = d instanceof Prisma.Decimal ? d : new Prisma.Decimal(d);
  return dec.toFixed(LIMITS.MONEY.SCALE);
}

/**
 * Sums an array of Prisma.Decimal values, returning a Prisma.Decimal.
 */
export function sumMoney(amounts: (Prisma.Decimal | string | number)[]): Prisma.Decimal {
  return amounts.reduce<Prisma.Decimal>((acc, cur) => {
    const dec = cur instanceof Prisma.Decimal ? cur : new Prisma.Decimal(cur);
    return acc.add(dec);
  }, new Prisma.Decimal(0));
}

/**
 * Computes (part / whole) * 100 as a Prisma.Decimal rounded to 1 decimal place.
 * Returns 0 if whole is zero or negative.
 */
export function percentOf(
  part: Prisma.Decimal | string | number,
  whole: Prisma.Decimal | string | number
): Prisma.Decimal {
  const w = whole instanceof Prisma.Decimal ? whole : new Prisma.Decimal(whole);
  if (w.isZero() || w.isNegative()) {
    return new Prisma.Decimal(0);
  }

  const p = part instanceof Prisma.Decimal ? part : new Prisma.Decimal(part);
  return p
    .mul(100)
    .div(w)
    .toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Evaluates whether spent has reached or exceeded a budget threshold percentage.
 * Computed EXACTLY as: spent * 100 >= thresholdPct * budget without rounding or float conversions.
 */
export function reachedThreshold(
  spent: Prisma.Decimal,
  budget: Prisma.Decimal,
  thresholdPct: number
): boolean {
  return spent.mul(100).gte(budget.mul(thresholdPct));
}

/**
 * Computes the percentage change between a current value and a previous value.
 * Returns null if previous is zero or non-positive. Rounded to 1 decimal place.
 */
export function percentChange(
  current: Prisma.Decimal | string | number,
  previous: Prisma.Decimal | string | number
): number | null {
  const cur = current instanceof Prisma.Decimal ? current : new Prisma.Decimal(current);
  const prev = previous instanceof Prisma.Decimal ? previous : new Prisma.Decimal(previous);

  if (prev.isZero()) {
    return null;
  }

  const change = cur
    .sub(prev)
    .mul(100)
    .div(prev)
    .toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP);
  return change.toNumber();
}

/**
 * Computes the savings rate as ((income - expense) / income) * 100 rounded to 1 decimal place.
 * Returns null if income <= 0.
 */
export function savingsRate(
  income: Prisma.Decimal | string | number,
  expense: Prisma.Decimal | string | number
): number | null {
  const inc = income instanceof Prisma.Decimal ? income : new Prisma.Decimal(income);
  const exp = expense instanceof Prisma.Decimal ? expense : new Prisma.Decimal(expense);

  if (inc.lte(0)) {
    return null;
  }

  const rate = inc
    .sub(exp)
    .mul(100)
    .div(inc)
    .toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP);
  return rate.toNumber();
}
