import React, { forwardRef } from 'react';
import { clsx } from 'clsx';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
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
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={clsx(errorId, helperId) || undefined}
          className={clsx(
            'w-full px-3 py-2 text-sm bg-panel text-ink border rounded-sm placeholder:text-muted/60 transition-colors',
            'focus-visible:outline-2 focus-visible:outline-marigold focus-visible:outline-offset-2',
            'min-h-[44px] sm:min-h-[38px]',
            error ? 'border-danger focus-visible:border-danger' : 'border-hairline',
            props.disabled && 'opacity-60 cursor-not-allowed bg-paper',
            className
          )}
          {...props}
        />
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

Input.displayName = 'Input';
