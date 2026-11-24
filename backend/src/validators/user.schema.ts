import { z } from 'zod';
import { LIMITS } from '../config/limits';
import { trimmedString } from './common.schema';
import { isValidTimezone } from './auth.schema';

const SUPPORTED_CURRENCIES = new Set(Intl.supportedValuesOf('currency'));

export const alertThresholdsSchema = z
  .array(
    z
      .number()
      .int({ message: 'Threshold must be an integer' })
      .min(LIMITS.USER.ALERT_THRESHOLD_MIN_VALUE, {
        message: `Threshold must be between ${LIMITS.USER.ALERT_THRESHOLD_MIN_VALUE} and ${LIMITS.USER.ALERT_THRESHOLD_MAX_VALUE}`
      })
      .max(LIMITS.USER.ALERT_THRESHOLD_MAX_VALUE, {
        message: `Threshold must be between ${LIMITS.USER.ALERT_THRESHOLD_MIN_VALUE} and ${LIMITS.USER.ALERT_THRESHOLD_MAX_VALUE}`
      })
  )
  .min(LIMITS.USER.ALERT_THRESHOLDS_MIN_COUNT, {
    message: `Must specify at least ${LIMITS.USER.ALERT_THRESHOLDS_MIN_COUNT} alert threshold`
  })
  .max(LIMITS.USER.ALERT_THRESHOLDS_MAX_COUNT, {
    message: `Cannot specify more than ${LIMITS.USER.ALERT_THRESHOLDS_MAX_COUNT} alert thresholds`
  })
  .refine((items) => new Set(items).size === items.length, {
    message: 'Alert thresholds must contain unique values'
  })
  .transform((items) => [...items].sort((a, b) => a - b));

export const updateProfileSchema = z
  .object({
    name: trimmedString(LIMITS.USER.NAME_MIN_LENGTH, LIMITS.USER.NAME_MAX_LENGTH, 'Name').optional(),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .refine((val) => SUPPORTED_CURRENCIES.has(val), { message: 'Invalid currency code' })
      .optional(),
    timezone: z
      .string()
      .trim()
      .refine(isValidTimezone, { message: 'Invalid timezone' })
      .optional(),
    alertThresholds: alertThresholdsSchema.optional(),
    alertInAppEnabled: z.boolean().optional(),
    alertEmailEnabled: z.boolean().optional()
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
