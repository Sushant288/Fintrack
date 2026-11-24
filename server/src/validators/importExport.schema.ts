import { z } from 'zod';
import { PaymentMethod, TxType } from '@prisma/client';
import { LIMITS } from '../config/limits';
import { booleanQuery } from './common.schema';
import { refineTransactionFilters, transactionFilterFields } from './transaction.schema';

export const exportTransactionsQuerySchema = refineTransactionFilters(
  z
    .object({
      ...transactionFilterFields,
      format: z.enum(['csv']).optional().default('csv'),
      filename: z.string().trim().optional()
    })
    .strip()
);

export const csvMappingSchema = z
  .object({
    date: z.string().min(1, 'Date column mapping is required'),
    amount: z.string().min(1, 'Amount column mapping is required'),
    type: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    paymentMethod: z.string().optional().nullable()
  })
  .strict();

export const booleanField = (defaultValue = true) =>
  z
    .union([z.boolean(), z.enum(['true', 'false', '0', '1'])])
    .optional()
    .default(defaultValue)
    .transform((val) => {
      if (typeof val === 'boolean') return val;
      return val === 'true' || val === '1';
    });

export const importConfirmSchema = z
  .object({
    mapping: csvMappingSchema,
    defaultCategoryId: z.string().uuid().optional(),
    defaultType: z.nativeEnum(TxType).optional().default(TxType.EXPENSE),
    defaultPaymentMethod: z.nativeEnum(PaymentMethod).optional().default(PaymentMethod.OTHER),
    skipDuplicates: booleanField(true)
  })
  .strip();

export const listImportBatchesQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(LIMITS.PAGINATION.DEFAULT_PAGE),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(LIMITS.PAGINATION.MAX_PAGE_SIZE)
      .default(LIMITS.PAGINATION.DEFAULT_PAGE_SIZE)
  })
  .strip();

export type ExportTransactionsQuery = z.infer<typeof exportTransactionsQuerySchema>;
export type ImportConfirmInput = z.infer<typeof importConfirmSchema>;
export type ListImportBatchesQuery = z.infer<typeof listImportBatchesQuerySchema>;
