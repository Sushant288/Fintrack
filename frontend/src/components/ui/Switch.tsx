import React from 'react';
import { clsx } from 'clsx';

export interface SwitchProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

export const Switch: React.FC<SwitchProps> = ({
  id,
  checked,
  onChange,
  label,
  description,
  disabled = false
}) => {
  const switchId = id || label.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="flex flex-col">
        <label htmlFor={switchId} className="text-sm font-medium text-ink cursor-pointer select-none">
          {label}
        </label>
        {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
      </div>
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
          'focus-visible:outline-2 focus-visible:outline-marigold focus-visible:outline-offset-2',
          checked ? 'bg-primary' : 'bg-hairline',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span
          className={clsx(
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-panel shadow ring-0 transition duration-200 ease-in-out',
            checked ? 'translate-x-5' : 'translate-x-0'
          )}
        />
      </button>
    </div>
  );
};
