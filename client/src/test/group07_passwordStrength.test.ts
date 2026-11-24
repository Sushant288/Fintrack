import { describe, it, expect } from 'vitest';
import { evaluatePasswordStrength } from '@/utils/passwordStrength';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MAX_BYTES
} from '@/config/limits';

describe('Group 7: PASSWORD STRENGTH', () => {
  it('returns deterministic scores and rule checklist for various passwords', () => {
    // Empty password
    const empty = evaluatePasswordStrength('');
    expect(empty.score).toBe(0);
    expect(empty.rules.find((r) => r.id === 'length')?.met).toBe(false);

    // Too short
    const short = evaluatePasswordStrength('Pass1');
    expect(short.score).toBe(0);
    expect(short.rules.find((r) => r.id === 'length')?.met).toBe(false);

    // Valid basic
    const basic = evaluatePasswordStrength('Password1');
    expect(basic.score).toBeGreaterThanOrEqual(2);
    expect(basic.rules.find((r) => r.id === 'length')?.met).toBe(true);
    expect(basic.rules.find((r) => r.id === 'letter')?.met).toBe(true);
    expect(basic.rules.find((r) => r.id === 'digit')?.met).toBe(true);

    // Strong password
    const strong = evaluatePasswordStrength('MySuperP@ssw0rd!2026');
    expect(strong.score).toBe(4);
    expect(strong.rules.every((r) => r.met)).toBe(true);
  });

  it('rules checklist matches defined config/limits constants', () => {
    const res = evaluatePasswordStrength('SamplePassword1');
    const lengthRule = res.rules.find((r) => r.id === 'length');
    expect(lengthRule?.label).toContain(String(PASSWORD_MIN_LENGTH));
    expect(lengthRule?.label).toContain(String(PASSWORD_MAX_LENGTH));

    const bytesRule = res.rules.find((r) => r.id === 'bytes');
    expect(bytesRule?.label).toContain(String(PASSWORD_MAX_BYTES));
  });
});
