import React from 'react';
import { useTheme } from '@/context/ThemeContext';
import { Sun, Moon, Laptop } from 'lucide-react';

export const ThemeToggle: React.FC = () => {
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === 'system') setTheme('light');
    else if (theme === 'light') setTheme('dark');
    else setTheme('system');
  };

  const icons = {
    system: <Laptop className="w-4 h-4" />,
    light: <Sun className="w-4 h-4" />,
    dark: <Moon className="w-4 h-4" />
  };

  const labels = {
    system: 'Theme: System preference',
    light: 'Theme: Light mode',
    dark: 'Theme: Dark mode'
  };

  return (
    <button
      type="button"
      onClick={cycleTheme}
      aria-label={labels[theme]}
      title={labels[theme]}
      className="p-2 rounded-sm text-muted hover:text-ink hover:bg-hairline/40 transition-colors focus-visible:outline-2 focus-visible:outline-marigold"
    >
      {icons[theme]}
    </button>
  );
};
