// M3: Budget schema
import { z } from 'zod';

export const budgetSchema = z.object({
  categoryId: z.string().uuid(),
  amount: z.number().positive(),
  period: z.enum(['MONTHLY', 'YEARLY']),
  startDate: z.string().datetime().or(z.date()),
  endDate: z.string().datetime().or(z.date()).optional()
});
