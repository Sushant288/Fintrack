import { z } from 'zod';

export const idParamSchema = z
  .object({
    id: z.string().uuid({ message: 'Parameter id must be a valid UUID' })
  })
  .strict();

export function trimmedString(min = 1, max?: number, fieldName = 'Field') {
  let schema = z.string().trim().min(min, { message: `${fieldName} must be at least ${min} character(s)` });
  if (max !== undefined) {
    schema = schema.max(max, { message: `${fieldName} cannot exceed ${max} characters` });
  }
  return schema;
}

export const booleanQuery = z
  .enum(['true', 'false'], {
    errorMap: () => ({ message: 'Expected boolean query value "true" or "false"' })
  })
  .transform((val) => val === 'true');
