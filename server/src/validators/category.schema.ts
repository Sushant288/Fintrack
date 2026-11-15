// M1: Category schema
import { z } from 'zod';

export const categorySchema = z.object({
  name: z.string().min(1).max(50),
  type: z.enum(['INCOME', 'EXPENSE']),
  icon: z.string().optional(),
  color: z.string().optional()
});
