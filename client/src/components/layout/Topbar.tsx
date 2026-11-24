import React from 'react';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';
import { Menu } from 'lucide-react';

export interface TopbarProps {
  onToggleSidebar?: () => void;
  title?: string;
}

export const Topbar: React.FC<TopbarProps> = ({ onToggleSidebar, title }) => {
  return (
    <header className="h-14 border-b border-hairline bg-panel/80 backdrop-blur px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Toggle navigation rail"
            className="p-1.5 rounded-sm text-muted hover:text-ink md:hidden focus-visible:outline-2 focus-visible:outline-marigold"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        {title && (
          <h1 className="text-lg font-heading font-semibold text-ink truncate">
            {title}
          </h1>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Reserved named slots for F2 (notification bell) and F4 (date range picker) */}
        <div data-slot="date-range-picker" aria-hidden="true" className="empty:hidden" />
        <div data-slot="notification-bell" aria-hidden="true" className="empty:hidden" />

        <ThemeToggle />
        <div className="h-4 w-[1px] bg-hairline" />
        <UserMenu />
      </div>
    </header>
  );
};
