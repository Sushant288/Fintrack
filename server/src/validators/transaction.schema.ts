import { z } from 'zod';
import { PaymentMethod, Prisma, TxType } from '@prisma/client';
import { LIMITS } from '../config/limits';
import { moneyAmount, sortParam, ymdDate } from './common.schema';

/**
 * Normalizes description:
 * - Trims leading/trailing whitespace
 * - Strips all ASCII and Unicode control characters (including NUL \u0000)
 * - Collapses empty string to null
 */
export function normalizeDescription(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val !== 'string') return null;
  const cleaned = val
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

const descriptionSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform(normalizeDescription)
  .refine(
    (desc) => desc === null || desc.length <= LIMITS.TRANSACTION.DESCRIPTION_MAX,
    {
      message: `Description cannot exceed ${LIMITS.TRANSACTION.DESCRIPTION_MAX} characters`
    }
  );

export const createTransactionSchema = z
  .object({
    type: z.nativeEnum(TxType, {
      required_error: 'Type is required',
      invalid_type_error: 'Type must be INCOME or EXPENSE'
    }),
    amount: moneyAmount,
    date: ymdDate,
    categoryId: z
      .string({ required_error: 'categoryId is required' })
      .uuid({ message: 'categoryId must be a valid UUID' }),
    description: descriptionSchema.optional().default(null),
    paymentMethod: z
      .nativeEnum(PaymentMethod, {
        invalid_type_error: 'Invalid payment method'
      })
      .optional()
      .default(PaymentMethod.OTHER)
  })
  .strict();

export const updateTransactionSchema = z
  .object({
    type: z.nativeEnum(TxType).optional(),
    amount: moneyAmount.optional(),
    date: ymdDate.optional(),
    categoryId: z.string().uuid({ message: 'categoryId must be a valid UUID' }).optional(),
    description: descriptionSchema.optional(),
    paymentMethod: z.nativeEnum(PaymentMethod).optional()
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
  });

export const listTransactionsQuerySchema = z
  .object({
    from: ymdDate.optional(),
    to: ymdDate.optional(),
    type: z.nativeEnum(TxType).optional(),
    categoryId: z.string().uuid().optional(),
    paymentMethod: z.nativeEnum(PaymentMethod).optional(),
    minAmount: moneyAmount.optional(),
    maxAmount: moneyAmount.optional(),
    q: z.string().trim().optional(),
    page: z.coerce
      .number()
      .int()
      .positive()
      .default(LIMITS.PAGINATION.DEFAULT_PAGE),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(LIMITS.PAGINATION.MAX_PAGE_SIZE)
      .default(LIMITS.PAGINATION.DEFAULT_PAGE_SIZE),
    sort: sortParam(LIMITS.TRANSACTION.SORT_FIELDS, LIMITS.TRANSACTION.DEFAULT_SORT)
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
  )
  .refine(
    (q) => {
      if (!q.minAmount || !q.maxAmount) return true;
      try {
        const min = new Prisma.Decimal(q.minAmount);
        const max = new Prisma.Decimal(q.maxAmount);
        return min.lte(max);
      } catch {
        return false;
      }
    },
    {
      message: 'minAmount cannot be greater than maxAmount',
      path: ['minAmount']
    }
  );

export const bulkDeleteTransactionsSchema = z
  .object({
    ids: z
      .array(z.string().uuid({ message: 'Each id must be a valid UUID' }))
      .min(1, { message: 'At least one id must be provided' })
      .max(LIMITS.TRANSACTION.BULK_DELETE_MAX, {
        message: `Cannot bulk delete more than ${LIMITS.TRANSACTION.BULK_DELETE_MAX} transactions`
      })
      .transform((arr) => Array.from(new Set(arr)))
  })
  .strict();

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
export type BulkDeleteTransactionsInput = z.infer<typeof bulkDeleteTransactionsSchema>;
