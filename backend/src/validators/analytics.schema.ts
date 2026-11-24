import { z } from 'zod';
import { TxType } from '@prisma/client';
import { LIMITS } from '../config/limits';
import { ymdDate } from './common.schema';

export const summaryQuerySchema = z
  .object({
    range: z
      .enum([
        'this_month',
        'last_month',
        'this_quarter',
        'last_quarter',
        'this_year',
        'last_year',
        'last_30_days',
        'last_90_days',
        'last_12_months',
        'custom'
      ])
      .optional(),
    from: ymdDate.optional(),
    to: ymdDate.optional()
  })
  .strip()
  .refine(
    (q) => {
      if (!q.from || !q.to) return true;
      return q.from <= q.to;
    },
    {
      message: 'from date cannot be after to date',
      path: ['from']
    }
  );

export const categoryBreakdownQuerySchema = z
  .object({
    type: z.nativeEnum(TxType).optional().default(TxType.EXPENSE),
    range: z
      .enum([
        'this_month',
        'last_month',
        'this_quarter',
        'last_quarter',
        'this_year',
        'last_year',
        'last_30_days',
        'last_90_days',
        'last_12_months',
        'custom'
      ])
      .optional(),
    from: ymdDate.optional(),
    to: ymdDate.optional()
  })
  .strip()
  .refine(
    (q) => {
      if (!q.from || !q.to) return true;
      return q.from <= q.to;
    },
    {
      message: 'from date cannot be after to date',
      path: ['from']
    }
  );

export const trendQuerySchema = z
  .object({
    interval: z.enum(['daily', 'weekly', 'monthly']).optional().default('monthly'),
    months: z.coerce
      .number()
      .int()
      .positive()
      .max(LIMITS.ANALYTICS.TREND_MAX_MONTHS)
      .default(12),
    days: z.coerce
      .number()
      .int()
      .positive()
      .max(LIMITS.ANALYTICS.TREND_MAX_DAYS)
      .default(30),
    from: ymdDate.optional(),
    to: ymdDate.optional()
  })
  .strip()
  .refine(
    (q) => {
      if (!q.from || !q.to) return true;
      return q.from <= q.to;
    },
    {
      message: 'from date cannot be after to date',
      path: ['from']
    }
  );

export const budgetVsActualQuerySchema = z
  .object({
    year: z.coerce
      .number()
      .int()
      .min(LIMITS.BUDGET.YEAR_MIN)
      .max(LIMITS.BUDGET.YEAR_MAX)
      .optional(),
    month: z.coerce.number().int().min(1).max(12).optional()
  })
  .strip();

export type SummaryQuery = z.infer<typeof summaryQuerySchema>;
export type CategoryBreakdownQuery = z.infer<typeof categoryBreakdownQuerySchema>;
export type TrendQuery = z.infer<typeof trendQuerySchema>;
export type BudgetVsActualQuery = z.infer<typeof budgetVsActualQuerySchema>;
