import { z } from 'zod';
import { LIMITS } from '../config/limits';
import { booleanQuery } from './common.schema';

export const listAlertsQuerySchema = z
  .object({
    unread: booleanQuery.optional(),
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

export type ListAlertsQuery = z.infer<typeof listAlertsQuerySchema>;
