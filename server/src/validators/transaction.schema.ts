// M2: Transaction schema
import { z } from 'zod';

export const transactionSchema = z.object({
  categoryId: z.string().uuid(),
  amount: z.number().positive(),
  type: z.enum(['INCOME', 'EXPENSE']),
  date: z.string().datetime().or(z.date()),
  notes: z.string().max(500).optional()
});
