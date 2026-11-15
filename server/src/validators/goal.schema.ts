// M5: Goal schema
import { z } from 'zod';

export const goalSchema = z.object({
  title: z.string().min(1).max(100),
  targetAmount: z.number().positive(),
  currentAmount: z.number().nonnegative().optional(),
  deadline: z.string().datetime().or(z.date()).optional()
});
