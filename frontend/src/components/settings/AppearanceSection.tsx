import React from 'react';
import { useTheme, Theme } from '@/context/ThemeContext';
import { clsx } from 'clsx';
import { Sun, Moon, Laptop } from 'lucide-react';

export const AppearanceSection: React.FC = () => {
  const { theme, setTheme } = useTheme();

  const options: { value: Theme; label: string; desc: string; icon: React.ReactNode }[] = [
    {
      value: 'system',
      label: 'System preference',
      desc: 'Follow your operating system appearance setting.',
      icon: <Laptop className="w-5 h-5 text-muted" />
    },
    {
      value: 'light',
      label: 'Light theme',
      desc: 'Pale ruled passbook paper with dark blue ink.',
      icon: <Sun className="w-5 h-5 text-marigold" />
    },
    {
      value: 'dark',
      label: 'Dark theme',
      desc: 'Deep indigo night paper with high-contrast text.',
      icon: <Moon className="w-5 h-5 text-primary" />
    }
  ];

  return (
    <div className="space-y-3 max-w-form" role="radiogroup" aria-label="Appearance options">
      {options.map((opt) => {
        const isSelected = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => setTheme(opt.value)}
            className={clsx(
              'w-full flex items-start gap-4 p-4 rounded-md border text-left transition-colors select-none',
              'focus-visible:outline-2 focus-visible:outline-marigold',
              isSelected
                ? 'bg-panel border-primary ring-1 ring-primary/40'
                : 'bg-panel border-hairline hover:bg-paper'
            )}
          >
            <div className="pt-0.5 flex-shrink-0">{opt.icon}</div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-ink block">{opt.label}</span>
              <span className="text-xs text-muted block mt-0.5">{opt.desc}</span>
            </div>
            <div
              className={clsx(
                'w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5',
                isSelected ? 'border-primary' : 'border-hairline'
              )}
            >
              {isSelected && <div className="w-2 h-2 rounded-full bg-primary" />}
            </div>
          </button>
        );
      })}
    </div>
  );
};
