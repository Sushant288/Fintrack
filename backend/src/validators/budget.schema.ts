import { z } from 'zod';
import { moneyAmount, monthNumber, yearNumber } from './common.schema';

export const viewBudgetQuerySchema = z
  .object({
    month: monthNumber.optional(),
    year: yearNumber.optional()
  })
  .refine(
    (q) => (q.month === undefined && q.year === undefined) || (q.month !== undefined && q.year !== undefined),
    {
      message: 'Both month and year must be provided together',
      path: ['month']
    }
  );

export const upsertBudgetSchema = z
  .object({
    categoryId: z
      .string({ required_error: 'categoryId is required' })
      .uuid({ message: 'categoryId must be a valid UUID' }),
    month: monthNumber,
    year: yearNumber,
    amount: moneyAmount
  })
  .strict();

export const upsertOverallBudgetSchema = z
  .object({
    month: monthNumber,
    year: yearNumber,
    amount: moneyAmount
  })
  .strict();

export const deleteOverallBudgetQuerySchema = z
  .object({
    month: monthNumber,
    year: yearNumber
  })
  .strict();

export const copyBudgetSchema = z
  .object({
    toMonth: monthNumber,
    toYear: yearNumber,
    fromMonth: monthNumber.optional(),
    fromYear: yearNumber.optional(),
    overwrite: z.boolean().optional().default(false)
  })
  .strict()
  .refine(
    (data) =>
      (data.fromMonth === undefined && data.fromYear === undefined) ||
      (data.fromMonth !== undefined && data.fromYear !== undefined),
    {
      message: 'Both fromMonth and fromYear must be provided together',
      path: ['fromMonth']
    }
  );

export type ViewBudgetQuery = z.infer<typeof viewBudgetQuerySchema>;
export type UpsertBudgetInput = z.infer<typeof upsertBudgetSchema>;
export type UpsertOverallBudgetInput = z.infer<typeof upsertOverallBudgetSchema>;
export type DeleteOverallBudgetQuery = z.infer<typeof deleteOverallBudgetQuerySchema>;
export type CopyBudgetInput = z.infer<typeof copyBudgetSchema>;
