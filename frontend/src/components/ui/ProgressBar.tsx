import React from 'react';
import { clsx } from 'clsx';

export interface ProgressBarProps {
  value: number; // 0 to 100
  max?: number;
  className?: string;
  barClassName?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  className,
  barClassName
}) => {
  const clamped = Math.min(Math.max(0, value), max);
  const percentage = Math.round((clamped / max) * 100);

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={max}
      className={clsx('w-full h-2 bg-hairline rounded-full overflow-hidden', className)}
    >
      <div
        className={clsx('h-full bg-primary transition-all duration-300 rounded-full', barClassName)}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
};
