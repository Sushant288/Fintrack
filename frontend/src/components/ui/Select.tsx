import React, { forwardRef } from 'react';
import { clsx } from 'clsx';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, helperText, options, id, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    const errorId = selectId && error ? `${selectId}-error` : undefined;
    const helperId = selectId && helperText ? `${selectId}-helper` : undefined;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium text-ink mb-1.5 select-none"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          aria-invalid={Boolean(error)}
          aria-describedby={clsx(errorId, helperId) || undefined}
          className={clsx(
            'w-full px-3 py-2 text-sm bg-panel text-ink border rounded-sm transition-colors',
            'focus-visible:outline-2 focus-visible:outline-marigold focus-visible:outline-offset-2',
            'min-h-[44px] sm:min-h-[38px]',
            error ? 'border-danger' : 'border-hairline',
            props.disabled && 'opacity-60 cursor-not-allowed bg-paper',
            className
          )}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
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

Select.displayName = 'Select';
