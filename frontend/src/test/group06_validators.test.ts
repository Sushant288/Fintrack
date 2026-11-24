import { describe, it, expect } from 'vitest';
import {
  passwordValidator,
  loginSchema,
  registerSchema,
  profileSchema,
  alertPreferencesSchema,
  categoryFormSchema
} from '@/utils/validators';
import { normalizeHex } from '@/utils/color';

describe('Group 6: VALIDATORS', () => {
  describe('Password Validator', () => {
    it('rejects passwords shorter than 8 characters', () => {
      const res = passwordValidator.safeParse('Pass1');
      expect(res.success).toBe(false);
      expect(res.error?.errors[0].message).toContain('at least 8 characters');
    });

    it('rejects passwords longer than 72 characters', () => {
      const longPass = 'A1' + 'a'.repeat(75);
      const res = passwordValidator.safeParse(longPass);
      expect(res.success).toBe(false);
      expect(res.error?.errors[0].message).toContain('at most 72 characters');
    });

    it('rejects passwords exceeding 72 bytes via multi-byte characters even if under 72 chars', () => {
      // 'é' is 2 bytes in UTF-8. 37 * 2 = 74 bytes (> 72 bytes), but only 38 chars.
      const multiBytePass = 'A1' + 'é'.repeat(37);
      expect(multiBytePass.length).toBeLessThanOrEqual(72);
      expect(new TextEncoder().encode(multiBytePass).length).toBeGreaterThan(72);

      const res = passwordValidator.safeParse(multiBytePass);
      expect(res.success).toBe(false);
      expect(res.error?.errors[0].message).toContain('72 bytes');
    });

    it('rejects passwords without digits', () => {
      const res = passwordValidator.safeParse('PasswordOnlyLetters');
      expect(res.success).toBe(false);
      expect(res.error?.errors[0].message).toContain('at least one number');
    });

    it('rejects passwords without letters', () => {
      const res = passwordValidator.safeParse('1234567890');
      expect(res.success).toBe(false);
      expect(res.error?.errors[0].message).toContain('at least one letter');
    });

    it('accepts valid password meeting all criteria', () => {
      const res = passwordValidator.safeParse('CorrectHorseBattery9');
      expect(res.success).toBe(true);
    });
  });

  describe('Form Schemas', () => {
    it('loginSchema trims email and requires password', () => {
      const res = loginSchema.safeParse({ email: ' user@example.com ', password: 'any' });
      expect(res.success).toBe(true);
      expect(res.data?.email).toBe('user@example.com');
    });

    it('registerSchema requires passwords to match', () => {
      const res = registerSchema.safeParse({
        name: 'User',
        email: 'user@example.com',
        password: 'ValidPassword1',
        confirmPassword: 'MismatchPassword2'
      });
      expect(res.success).toBe(false);
      expect(res.error?.errors[0].message).toContain('Passwords do not match');
    });

    it('profileSchema enforces name length limits', () => {
      expect(profileSchema.safeParse({ name: '' }).success).toBe(false);
      expect(profileSchema.safeParse({ name: 'a'.repeat(61) }).success).toBe(false);
      expect(profileSchema.safeParse({ name: 'Valid Name' }).success).toBe(true);
    });

    it('alertPreferencesSchema validates uniqueness, ranges, count and sorts output', () => {
      // Duplicate rejection
      expect(
        alertPreferencesSchema.safeParse({
          alertThresholds: [80, 80],
          alertInAppEnabled: true,
          alertEmailEnabled: false
        }).success
      ).toBe(false);

      // Value out of bounds (1 to 100)
      expect(
        alertPreferencesSchema.safeParse({
          alertThresholds: [0, 50],
          alertInAppEnabled: true,
          alertEmailEnabled: false
        }).success
      ).toBe(false);

      // Max count (5) exceeded
      expect(
        alertPreferencesSchema.safeParse({
          alertThresholds: [10, 20, 30, 40, 50, 60],
          alertInAppEnabled: true,
          alertEmailEnabled: false
        }).success
      ).toBe(false);

      // Sorted output
      const valid = alertPreferencesSchema.safeParse({
        alertThresholds: [90, 50, 100, 75],
        alertInAppEnabled: true,
        alertEmailEnabled: false
      });
      expect(valid.success).toBe(true);
      expect(valid.data?.alertThresholds).toEqual([50, 75, 90, 100]);
    });

    it('color normalization produces lowercase #rrggbb', () => {
      expect(normalizeHex('#FFF')).toBe('#ffffff');
      expect(normalizeHex('#Ef4444')).toBe('#ef4444');
      expect(normalizeHex('22c55e')).toBe('#22c55e');
    });

    it('categoryFormSchema validates name limits and color format', () => {
      expect(
        categoryFormSchema.safeParse({
          name: '',
          type: 'EXPENSE',
          color: '#ef4444',
          icon: 'tag'
        }).success
      ).toBe(false);

      expect(
        categoryFormSchema.safeParse({
          name: 'a'.repeat(41),
          type: 'EXPENSE',
          color: '#ef4444',
          icon: 'tag'
        }).success
      ).toBe(false);

      expect(
        categoryFormSchema.safeParse({
          name: 'Groceries',
          type: 'EXPENSE',
          color: 'invalid-color',
          icon: 'tag'
        }).success
      ).toBe(false);

      expect(
        categoryFormSchema.safeParse({
          name: 'Groceries',
          type: 'EXPENSE',
          color: '#ef4444',
          icon: 'utensils'
        }).success
      ).toBe(true);
    });
  });
});
