import { z } from 'zod';
import { LIMITS } from '../config/limits';
import { trimmedString } from './common.schema';

const SUPPORTED_CURRENCIES = new Set(Intl.supportedValuesOf('currency'));

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const passwordPolicy = z
  .string()
  .min(LIMITS.PASSWORD.MIN_LENGTH, {
    message: `Password must be at least ${LIMITS.PASSWORD.MIN_LENGTH} characters`
  })
  .max(LIMITS.PASSWORD.MAX_LENGTH, {
    message: `Password cannot exceed ${LIMITS.PASSWORD.MAX_LENGTH} characters`
  })
  .refine((val) => Buffer.byteLength(val, 'utf8') <= LIMITS.PASSWORD.MAX_BYTES, {
    message: `Password cannot exceed ${LIMITS.PASSWORD.MAX_BYTES} bytes`
  })
  .refine((val) => /[A-Za-z]/.test(val), {
    message: 'Password must contain at least one letter'
  })
  .refine((val) => /\d/.test(val), {
    message: 'Password must contain at least one digit'
  });

export const loginPassword = z
  .string()
  .min(1, { message: 'Password is required' })
  .max(LIMITS.PASSWORD.LOGIN_MAX_LENGTH, { message: 'Password too long' });

export const registerSchema = z
  .object({
    name: trimmedString(LIMITS.USER.NAME_MIN_LENGTH, LIMITS.USER.NAME_MAX_LENGTH, 'Name'),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email({ message: 'Invalid email address format' })
      .max(LIMITS.USER.EMAIL_MAX_LENGTH, {
        message: `Email cannot exceed ${LIMITS.USER.EMAIL_MAX_LENGTH} characters`
      }),
    password: passwordPolicy,
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
      .optional()
  })
  .strict();

export const loginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email({ message: 'Invalid email address format' })
      .max(LIMITS.USER.EMAIL_MAX_LENGTH, {
        message: `Email cannot exceed ${LIMITS.USER.EMAIL_MAX_LENGTH} characters`
      }),
    password: loginPassword
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: loginPassword,
    newPassword: passwordPolicy
  })
  .strict();

export const deleteAccountSchema = z
  .object({
    password: loginPassword
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
