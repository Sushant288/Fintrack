import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { LIMITS } from '../config/limits';
import { isValidYmd } from '../utils/dates';

export const idParamSchema = z
  .object({
    id: z.string().uuid({ message: 'Parameter id must be a valid UUID' })
  })
  .strict();

export function trimmedString(min = 1, max?: number, fieldName = 'Field') {
  let schema = z.string().trim().min(min, { message: `${fieldName} must be at least ${min} character(s)` });
  if (max !== undefined) {
    schema = schema.max(max, { message: `${fieldName} cannot exceed ${max} characters` });
  }
  return schema;
}

export const booleanQuery = z
  .enum(['true', 'false'], {
    errorMap: () => ({ message: 'Expected boolean query value "true" or "false"' })
  })
  .transform((val) => val === 'true');

/**
 * Validates a strict calendar date string in YYYY-MM-DD format.
 */
export const ymdDate = z
  .string({ required_error: 'Date is required', invalid_type_error: 'Date must be a string' })
  .trim()
  .refine(isValidYmd, {
    message: 'Date must be a valid calendar date in YYYY-MM-DD format'
  });

/**
 * Validates a money amount string or JSON number.
 * Accepts string or number, rejects scientific notation, signs, thousands separators,
 * and enforces > 0 and <= MONEY_MAX with at most MONEY_SCALE decimal places.
 * Outputs the validated STRING representation.
 */
export const moneyAmount = z.preprocess(
  (val) => {
    if (typeof val === 'number') {
      return Number.isFinite(val) ? String(val) : '';
    }
    if (typeof val === 'string') {
      return val.trim();
    }
    return val;
  },
  z
    .string({ required_error: 'Amount is required', invalid_type_error: 'Amount must be a string or number' })
    .refine((s) => LIMITS.MONEY.REGEX.test(s), {
      message: `Amount must be a positive number with up to ${LIMITS.MONEY.SCALE} decimal places`
    })
    .refine(
      (s) => {
        try {
          const d = new Prisma.Decimal(s);
          return d.gt(0) && d.lte(new Prisma.Decimal(LIMITS.MONEY.MAX));
        } catch {
          return false;
        }
      },
      {
        message: `Amount must be strictly greater than 0 and at most ${LIMITS.MONEY.MAX}`
      }
    )
);

/**
 * Validates a calendar month number (1 to 12).
 */
export const monthNumber = z.coerce
  .number({ required_error: 'Month is required', invalid_type_error: 'Month must be an integer' })
  .int({ message: 'Month must be an integer' })
  .min(1, { message: 'Month must be between 1 and 12' })
  .max(12, { message: 'Month must be between 1 and 12' });

/**
 * Validates a calendar year number within BUDGET limits.
 */
export const yearNumber = z.coerce
  .number({ required_error: 'Year is required', invalid_type_error: 'Year must be an integer' })
  .int({ message: 'Year must be an integer' })
  .min(LIMITS.BUDGET.YEAR_MIN, { message: `Year must be at least ${LIMITS.BUDGET.YEAR_MIN}` })
  .max(LIMITS.BUDGET.YEAR_MAX, { message: `Year must be at most ${LIMITS.BUDGET.YEAR_MAX}` });

/**
 * Parses and validates a sort query parameter in "field:dir" format.
 */
export function sortParam<T extends readonly string[]>(allowedFields: T, defaultSort: string) {
  return z
    .preprocess((val) => (val === undefined || val === '' ? defaultSort : val), z.string())
    .superRefine((val, ctx) => {
      const parts = val.split(':');
      if (parts.length !== 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Sort must be in format "field:dir", got "${val}"`
        });
        return;
      }
      const [field, dir] = parts;
      if (!allowedFields.includes(field as any)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Sort field must be one of: ${allowedFields.join(', ')}`
        });
        return;
      }
      if (dir !== 'asc' && dir !== 'desc') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Sort direction must be "asc" or "desc", got "${dir}"`
        });
        return;
      }
    })
    .transform((val) => {
      const [field, dir] = val.split(':');
      return { field: field as T[number], dir: dir as 'asc' | 'desc' };
    });
}
