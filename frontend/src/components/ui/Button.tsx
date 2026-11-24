import React, { forwardRef } from 'react';
import { clsx } from 'clsx';
import { Spinner } from './Spinner';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-marigold focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none min-h-[44px] sm:min-h-[36px]';

    const variants = {
      primary:
        'bg-primary text-[var(--color-primary-contrast)] hover:opacity-90 active:opacity-95 shadow-sm',
      secondary:
        'bg-panel text-ink border border-hairline hover:bg-paper active:bg-hairline',
      danger:
        'bg-danger text-white hover:opacity-90 active:opacity-95 shadow-sm',
      ghost:
        'bg-transparent text-ink hover:bg-hairline/50 active:bg-hairline'
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-xs rounded-sm',
      md: 'px-4 py-2 text-sm rounded-sm',
      lg: 'px-5 py-2.5 text-base rounded-sm'
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={clsx(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading && <Spinner className="w-4 h-4 mr-2" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
