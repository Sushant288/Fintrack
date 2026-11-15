import { z } from 'zod';
import { TxType } from '@prisma/client';
import { LIMITS } from '../config/limits';
import { trimmedString } from './common.schema';

export const categoryBooleanQuery = z
  .enum(['true', 'false'], {
    errorMap: () => ({ message: 'includeArchived must be "true" or "false"' })
  })
  .optional()
  .transform((val) => val === 'true');

export const createCategorySchema = z
  .object({
    name: trimmedString(LIMITS.CATEGORY.NAME_MIN_LENGTH, LIMITS.CATEGORY.NAME_MAX_LENGTH, 'Name'),
    type: z.nativeEnum(TxType, {
      errorMap: () => ({ message: 'Category type must be either INCOME or EXPENSE' })
    }),
    color: z
      .string()
      .trim()
      .regex(LIMITS.CATEGORY.COLOR_REGEX, {
        message: 'Color must be a valid hex color code in #RRGGBB format'
      })
      .transform((val) => val.toLowerCase())
      .optional(),
    icon: z
      .string()
      .trim()
      .max(LIMITS.CATEGORY.ICON_MAX_LENGTH, {
        message: `Icon cannot exceed ${LIMITS.CATEGORY.ICON_MAX_LENGTH} characters`
      })
      .regex(LIMITS.CATEGORY.ICON_REGEX, {
        message: 'Icon must contain only lowercase alphanumeric characters and hyphens'
      })
      .optional(),
    parentId: z.string().uuid({ message: 'parentId must be a valid UUID' }).optional()
  })
  .strict();

export const updateCategorySchema = z
  .object({
    name: trimmedString(LIMITS.CATEGORY.NAME_MIN_LENGTH, LIMITS.CATEGORY.NAME_MAX_LENGTH, 'Name').optional(),
    color: z
      .string()
      .trim()
      .regex(LIMITS.CATEGORY.COLOR_REGEX, {
        message: 'Color must be a valid hex color code in #RRGGBB format'
      })
      .transform((val) => val.toLowerCase())
      .optional(),
    icon: z
      .string()
      .trim()
      .max(LIMITS.CATEGORY.ICON_MAX_LENGTH, {
        message: `Icon cannot exceed ${LIMITS.CATEGORY.ICON_MAX_LENGTH} characters`
      })
      .regex(LIMITS.CATEGORY.ICON_REGEX, {
        message: 'Icon must contain only lowercase alphanumeric characters and hyphens'
      })
      .optional(),
    isArchived: z.boolean().optional(),
    parentId: z.string().uuid({ message: 'parentId must be a valid UUID' }).nullable().optional(),
    type: z.never({
      errorMap: () => ({ message: 'Category type cannot be changed' })
    }).optional()
  })
  .strict()
  .refine(
    (data) => {
      const keys = Object.keys(data).filter((k) => k !== 'type');
      return keys.length > 0;
    },
    { message: 'At least one field must be provided for update' }
  );

export const categoryListQuerySchema = z.object({
  type: z.nativeEnum(TxType, {
    errorMap: () => ({ message: 'Category type filter must be either INCOME or EXPENSE' })
  }).optional(),
  includeArchived: categoryBooleanQuery,
  q: z.string().trim().optional()
});

export const categoryDeleteQuerySchema = z
  .object({
    reassignTo: z.string().uuid({ message: 'reassignTo must be a valid UUID' }).optional(),
    reassignToCategoryId: z.string().uuid({ message: 'reassignToCategoryId must be a valid UUID' }).optional()
  })
  .transform((val) => ({
    reassignTo: val.reassignTo ?? val.reassignToCategoryId
  }));

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CategoryListQuery = z.infer<typeof categoryListQuerySchema>;
export type CategoryDeleteQuery = z.infer<typeof categoryDeleteQuerySchema>;
