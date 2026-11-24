import { z } from 'zod';
import {
  USER_NAME_MIN_LENGTH,
  USER_NAME_MAX_LENGTH,
  USER_EMAIL_MAX_LENGTH,
  USER_CURRENCY_LENGTH,
  ALERT_THRESHOLDS_MIN_COUNT,
  ALERT_THRESHOLDS_MAX_COUNT,
  ALERT_THRESHOLD_MIN_VALUE,
  ALERT_THRESHOLD_MAX_VALUE,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MAX_BYTES,
  CATEGORY_NAME_MIN_LENGTH,
  CATEGORY_NAME_MAX_LENGTH,
  CATEGORY_COLOR_REGEX,
  CATEGORY_ICON_MAX_LENGTH
} from '@/config/limits';
import { normalizeHex } from './color';

// 1. Password validator mirroring byte and character limits
export const passwordValidator = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`)
  .refine(
    (pwd) => new TextEncoder().encode(pwd).length <= PASSWORD_MAX_BYTES,
    `Password cannot exceed ${PASSWORD_MAX_BYTES} bytes`
  )
  .refine((pwd) => /[a-zA-Z]/.test(pwd), 'Password must contain at least one letter')
  .refine((pwd) => /[0-9]/.test(pwd), 'Password must contain at least one number');

// 2. Login schema (non-empty only, never leaks password policy)
export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});
export type LoginInput = z.infer<typeof loginSchema>;

// 3. Register schema
export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(USER_NAME_MIN_LENGTH, 'Name is required')
      .max(USER_NAME_MAX_LENGTH, `Name must not exceed ${USER_NAME_MAX_LENGTH} characters`),
    email: z
      .string()
      .trim()
      .min(1, 'Email is required')
      .max(USER_EMAIL_MAX_LENGTH, `Email must not exceed ${USER_EMAIL_MAX_LENGTH} characters`)
      .email('Invalid email address'),
    password: passwordValidator,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    useDeviceSettings: z.boolean().optional(),
    currency: z.string().length(USER_CURRENCY_LENGTH).optional(),
    timezone: z.string().min(1).optional()
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  });
export type RegisterInput = z.infer<typeof registerSchema>;

// 4. Profile schema
export const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(USER_NAME_MIN_LENGTH, 'Name is required')
    .max(USER_NAME_MAX_LENGTH, `Name must not exceed ${USER_NAME_MAX_LENGTH} characters`)
});
export type ProfileInput = z.infer<typeof profileSchema>;

// 5. Region / Preferences schema
export const preferencesSchema = z.object({
  currency: z.string().length(USER_CURRENCY_LENGTH, 'Currency must be 3 letters'),
  timezone: z.string().min(1, 'Time zone is required')
});
export type PreferencesInput = z.infer<typeof preferencesSchema>;

// 6. Alert Preferences schema
export const alertPreferencesSchema = z.object({
  alertThresholds: z
    .array(
      z
        .number()
        .int()
        .min(ALERT_THRESHOLD_MIN_VALUE, `Threshold must be at least ${ALERT_THRESHOLD_MIN_VALUE}%`)
        .max(ALERT_THRESHOLD_MAX_VALUE, `Threshold must be at most ${ALERT_THRESHOLD_MAX_VALUE}%`)
    )
    .min(ALERT_THRESHOLDS_MIN_COUNT, `At least ${ALERT_THRESHOLDS_MIN_COUNT} threshold is required`)
    .max(ALERT_THRESHOLDS_MAX_COUNT, `At most ${ALERT_THRESHOLDS_MAX_COUNT} thresholds allowed`)
    .refine((arr) => new Set(arr).size === arr.length, 'Thresholds must be unique')
    .transform((arr) => [...arr].sort((a, b) => a - b)),
  alertInAppEnabled: z.boolean(),
  alertEmailEnabled: z.boolean()
});
export type AlertPreferencesInput = z.infer<typeof alertPreferencesSchema>;

// 7. Change Password schema
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordValidator,
    confirmPassword: z.string().min(1, 'Please confirm your new password')
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// 8. Delete Account schema
export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Password is required to delete your account')
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

// 9. Category Form schema
export const categoryFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(CATEGORY_NAME_MIN_LENGTH, 'Category name is required')
    .max(CATEGORY_NAME_MAX_LENGTH, `Category name must not exceed ${CATEGORY_NAME_MAX_LENGTH} characters`),
  type: z.enum(['INCOME', 'EXPENSE']),
  color: z
    .string()
    .refine(
      (val) => /^#?[0-9a-fA-F]{6}$/.test(val) || /^#?[0-9a-fA-F]{3}$/.test(val),
      'Invalid color hex format'
    )
    .transform((val) => normalizeHex(val))
    .refine((val) => CATEGORY_COLOR_REGEX.test(val), 'Invalid color hex format'),
  icon: z.string().min(1, 'Icon is required').max(CATEGORY_ICON_MAX_LENGTH, 'Icon name too long'),
  parentId: z.string().uuid().nullable().optional()
});
export type CategoryFormInput = z.infer<typeof categoryFormSchema>;
