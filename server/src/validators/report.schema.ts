import { z } from 'zod';
import { LIMITS } from '../config/limits';

export const reportQuerySchema = z
  .object({
    year: z.coerce
      .number()
      .int()
      .min(LIMITS.BUDGET.YEAR_MIN)
      .max(LIMITS.BUDGET.YEAR_MAX),
    month: z.coerce.number().int().min(1).max(12)
  })
  .strip();

export const reportListQuerySchema = z
  .object({
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(LIMITS.REPORT.MAX_HISTORICAL_MONTHS)
      .default(LIMITS.REPORT.DEFAULT_HISTORICAL_MONTHS)
  })
  .strip();

export const regenerateReportSchema = z
  .object({
    year: z.coerce
      .number()
      .int()
      .min(LIMITS.BUDGET.YEAR_MIN)
      .max(LIMITS.BUDGET.YEAR_MAX),
    month: z.coerce.number().int().min(1).max(12)
  })
  .strict();

export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type ReportListQuery = z.infer<typeof reportListQuerySchema>;
export type RegenerateReportInput = z.infer<typeof regenerateReportSchema>;
