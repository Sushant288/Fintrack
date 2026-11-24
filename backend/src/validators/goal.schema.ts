import { z } from 'zod';
import { GoalStatus, PaymentMethod, Prisma } from '@prisma/client';
import { LIMITS } from '../config/limits';
import { booleanQuery, moneyAmount, trimmedString, ymdDate } from './common.schema';

const nonNegativeMoney = z.preprocess(
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
    .string({ invalid_type_error: 'Starting amount must be a string or number' })
    .refine((s) => LIMITS.MONEY.REGEX.test(s), {
      message: `Starting amount must be a non-negative number with up to ${LIMITS.MONEY.SCALE} decimal places`
    })
    .refine(
      (s) => {
        try {
          const d = new Prisma.Decimal(s);
          return d.gte(0) && d.lte(new Prisma.Decimal(LIMITS.MONEY.MAX));
        } catch {
          return false;
        }
      },
      {
        message: `Starting amount must be at least 0 and at most ${LIMITS.MONEY.MAX}`
      }
    )
);

export const createGoalSchema = z
  .object({
    name: trimmedString(1, LIMITS.GOALS.NAME_MAX, 'Name'),
    targetAmount: moneyAmount,
    deadline: ymdDate.optional(),
    startingAmount: nonNegativeMoney.optional(),
    icon: z
      .string()
      .regex(LIMITS.CATEGORY.ICON_REGEX, 'Icon must contain only lowercase letters, numbers, and hyphens')
      .max(LIMITS.CATEGORY.ICON_MAX_LENGTH)
      .optional(),
    color: z
      .string()
      .regex(LIMITS.CATEGORY.COLOR_REGEX, 'Color must be in #RRGGBB format')
      .toLowerCase()
      .optional()
  })
  .strict();

export const updateGoalSchema = z
  .object({
    name: trimmedString(1, LIMITS.GOALS.NAME_MAX, 'Name').optional(),
    targetAmount: moneyAmount.optional(),
    deadline: ymdDate.nullable().optional(),
    icon: z
      .string()
      .regex(LIMITS.CATEGORY.ICON_REGEX, 'Icon must contain only lowercase letters, numbers, and hyphens')
      .max(LIMITS.CATEGORY.ICON_MAX_LENGTH)
      .optional(),
    color: z
      .string()
      .regex(LIMITS.CATEGORY.COLOR_REGEX, 'Color must be in #RRGGBB format')
      .toLowerCase()
      .optional()
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
  });

export const contributeGoalSchema = z
  .object({
    kind: z.enum(LIMITS.GOALS.CONTRIBUTION_KINDS, {
      required_error: 'kind is required',
      invalid_type_error: 'kind must be DEPOSIT or WITHDRAWAL'
    }),
    amount: moneyAmount,
    note: z
      .string()
      .transform((val) => {
        const cleaned = val.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
        return cleaned.length > 0 ? cleaned : null;
      })
      .refine((val) => val === null || val.length <= LIMITS.GOALS.NOTE_MAX, {
        message: `Note cannot exceed ${LIMITS.GOALS.NOTE_MAX} characters`
      })
      .nullable()
      .optional(),
    createTransaction: z.boolean().optional().default(false),
    categoryId: z.string().uuid({ message: 'categoryId must be a valid UUID' }).optional(),
    date: ymdDate.optional(),
    paymentMethod: z.nativeEnum(PaymentMethod).optional()
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.createTransaction) {
      if (!data.categoryId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['categoryId'],
          message: 'categoryId is required when createTransaction is true'
        });
      }
    } else {
      if (data.categoryId !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['categoryId'],
          message: 'categoryId is only allowed when createTransaction is true'
        });
      }
      if (data.date !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['date'],
          message: 'date is only allowed when createTransaction is true'
        });
      }
      if (data.paymentMethod !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['paymentMethod'],
          message: 'paymentMethod is only allowed when createTransaction is true'
        });
      }
    }
  });

export const listGoalsQuerySchema = z
  .object({
    status: z.nativeEnum(GoalStatus).optional(),
    includeArchived: booleanQuery.optional()
  })
  .strip();

export const listContributionsQuerySchema = z
  .object({
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
      .default(LIMITS.PAGINATION.DEFAULT_PAGE_SIZE)
  })
  .strip();

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
export type ContributeGoalInput = z.infer<typeof contributeGoalSchema>;
export type ListGoalsQuery = z.infer<typeof listGoalsQuerySchema>;
export type ListContributionsQuery = z.infer<typeof listContributionsQuerySchema>;
