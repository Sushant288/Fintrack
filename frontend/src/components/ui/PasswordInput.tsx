import React, { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { clsx } from 'clsx';

export interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    const errorId = inputId && error ? `${inputId}-error` : undefined;
    const helperId = inputId && helperText ? `${inputId}-helper` : undefined;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-ink mb-1.5 select-none"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={showPassword ? 'text' : 'password'}
            aria-invalid={Boolean(error)}
            aria-describedby={clsx(errorId, helperId) || undefined}
            className={clsx(
              'w-full pl-3 pr-10 py-2 text-sm bg-panel text-ink border rounded-sm placeholder:text-muted/60 transition-colors',
              'focus-visible:outline-2 focus-visible:outline-marigold focus-visible:outline-offset-2',
              'min-h-[44px] sm:min-h-[38px]',
              error ? 'border-danger' : 'border-hairline',
              props.disabled && 'opacity-60 cursor-not-allowed bg-paper',
              className
            )}
            {...props}
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted hover:text-ink transition-colors rounded-sm focus-visible:outline-2 focus-visible:outline-marigold"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {error && (
          <p id={errorId} className="mt-1 text-xs text-danger font-medium" role="alert">
            {error}
          </p>
        )}
        {!error && helperText && (
          <p id={helperId} className="mt-1 text-xs text-muted">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

PasswordInput.displayName = 'PasswordInput';
