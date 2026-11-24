import { z } from 'zod';
import { Frequency, PaymentMethod, TxType } from '@prisma/client';
import { moneyAmount, ymdDate } from './common.schema';
import { descriptionSchema } from './transaction.schema';

export const createRecurringRuleSchema = z
  .object({
    type: z.nativeEnum(TxType, {
      required_error: 'Type is required',
      invalid_type_error: 'Type must be INCOME or EXPENSE'
    }),
    amount: moneyAmount,
    categoryId: z
      .string({ required_error: 'categoryId is required' })
      .uuid({ message: 'categoryId must be a valid UUID' }),
    frequency: z.nativeEnum(Frequency, {
      required_error: 'Frequency is required',
      invalid_type_error: 'Invalid frequency'
    }),
    startDate: ymdDate,
    endDate: ymdDate.optional(),
    description: descriptionSchema.optional().default(null),
    paymentMethod: z
      .nativeEnum(PaymentMethod, {
        invalid_type_error: 'Invalid payment method'
      })
      .optional()
      .default(PaymentMethod.OTHER)
  })
  .strict()
  .refine(
    (data) => {
      if (!data.endDate) return true;
      return data.endDate >= data.startDate;
    },
    {
      message: 'End date must be on or after start date',
      path: ['endDate']
    }
  );

export const updateRecurringRuleSchema = z
  .object({
    amount: moneyAmount.optional(),
    description: descriptionSchema.optional(),
    paymentMethod: z.nativeEnum(PaymentMethod).optional(),
    categoryId: z.string().uuid({ message: 'categoryId must be a valid UUID' }).optional(),
    frequency: z.nativeEnum(Frequency).optional(),
    startDate: ymdDate.optional(),
    endDate: ymdDate.nullable().optional(),
    type: z.any().optional()
  })
  .strict()
  .superRefine((data, ctx) => {
    if ('type' in data && data.type !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['type'],
        message: 'Rule type cannot be changed'
      });
    }

    const modifiableKeys = Object.keys(data).filter((k) => k !== 'type');
    if (modifiableKeys.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one field must be provided for update'
      });
    }

    if (data.startDate && data.endDate) {
      if (data.endDate < data.startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['endDate'],
          message: 'End date must be on or after start date'
        });
      }
    }
  });

export const listRecurringRulesQuerySchema = z
  .object({
    status: z.enum(['active', 'paused', 'completed']).optional(),
    type: z.nativeEnum(TxType).optional()
  })
  .strip();

export type CreateRecurringRuleInput = z.infer<typeof createRecurringRuleSchema>;
export type UpdateRecurringRuleInput = z.infer<typeof updateRecurringRuleSchema>;
export type ListRecurringRulesQuery = z.infer<typeof listRecurringRulesQuerySchema>;
