import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MAX_BYTES
} from '@/config/limits';

export interface PasswordRule {
  id: string;
  label: string;
  met: boolean;
}

export interface PasswordStrengthResult {
  score: number; // 0 to 4
  rules: PasswordRule[];
}

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const byteLength = new TextEncoder().encode(password).length;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);

  const isMinLength = password.length >= PASSWORD_MIN_LENGTH;
  const isMaxLength = password.length <= PASSWORD_MAX_LENGTH;
  const isMaxBytes = byteLength <= PASSWORD_MAX_BYTES;

  const rules: PasswordRule[] = [
    {
      id: 'length',
      label: `Between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`,
      met: isMinLength && isMaxLength
    },
    {
      id: 'bytes',
      label: `Maximum ${PASSWORD_MAX_BYTES} bytes`,
      met: isMaxBytes
    },
    {
      id: 'letter',
      label: 'At least one letter',
      met: hasLetter
    },
    {
      id: 'digit',
      label: 'At least one number',
      met: hasDigit
    }
  ];

  let score = 0;
  if (isMinLength && isMaxBytes) {
    score += 1;
    if (hasLetter && hasDigit) score += 1;
    if (password.length >= 12) score += 1;
    if (hasSpecial) score += 1;
  }

  return {
    score: Math.min(score, 4),
    rules
  };
}
