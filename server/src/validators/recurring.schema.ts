// M4: Recurring schema
import { z } from 'zod';

export const recurringSchema = z.object({
  categoryId: z.string().uuid(),
  amount: z.number().positive(),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
  nextDueDate: z.string().datetime().or(z.date())
});
