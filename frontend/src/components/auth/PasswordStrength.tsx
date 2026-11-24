import React from 'react';
import { evaluatePasswordStrength } from '@/utils/passwordStrength';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Check, Circle } from 'lucide-react';
import { clsx } from 'clsx';

export interface PasswordStrengthProps {
  password: string;
}

export const PasswordStrength: React.FC<PasswordStrengthProps> = ({ password }) => {
  const { score, rules } = evaluatePasswordStrength(password);

  const scoreLabels = ['Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
  const scoreColors = [
    'bg-danger',
    'bg-danger',
    'bg-warning',
    'bg-income',
    'bg-income'
  ];

  return (
    <div className="mt-2 space-y-2">
      {/* Progress meter */}
      <div className="space-y-1">
        <div className="flex justify-between items-center text-xs">
          <span className="text-muted">Password strength:</span>
          <span className="font-medium text-ink">{password ? scoreLabels[score] : 'Required'}</span>
        </div>
        <ProgressBar
          value={password ? (score + 1) * 20 : 0}
          barClassName={password ? scoreColors[score] : undefined}
        />
      </div>

      {/* Rules checklist */}
      <ul className="space-y-1 pt-1 text-xs" aria-label="Password requirements">
        {rules.map((rule) => (
          <li
            key={rule.id}
            className={clsx(
              'flex items-center gap-1.5 transition-colors',
              rule.met ? 'text-income font-medium' : 'text-muted'
            )}
          >
            {rule.met ? (
              <Check className="w-3.5 h-3.5 text-income flex-shrink-0" />
            ) : (
              <Circle className="w-2.5 h-2.5 text-muted/60 mx-0.5 flex-shrink-0" />
            )}
            <span>{rule.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
