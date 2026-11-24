import React from 'react';
import { clsx } from 'clsx';

export interface FormFieldProps {
  label?: string;
  error?: string;
  helperText?: string;
  id?: string;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  helperText,
  id,
  children,
  className
}) => {
  return (
    <div className={clsx('w-full', className)}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-ink mb-1.5 select-none">
          {label}
        </label>
      )}
      {children}
      {error && (
        <p className="mt-1 text-xs text-danger font-medium" role="alert">
          {error}
        </p>
      )}
      {!error && helperText && <p className="mt-1 text-xs text-muted">{helperText}</p>}
    </div>
  );
};
