import React from 'react';
import { NavLink } from 'react-router-dom';
import { ENABLED_NAV_ITEMS } from '@/config/nav';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  Tag,
  Settings,
  Receipt,
  PieChart,
  Repeat,
  Target,
  BarChart3,
  FileText,
  LucideProps,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-react';

const iconMap: Record<string, React.ComponentType<LucideProps>> = {
  'layout-dashboard': LayoutDashboard,
  tag: Tag,
  settings: Settings,
  receipt: Receipt,
  'pie-chart': PieChart,
  repeat: Repeat,
  target: Target,
  'bar-chart-3': BarChart3,
  'file-text': FileText
};

export interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  onToggleCollapse,
  isOpenMobile,
  onCloseMobile
}) => {
  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          role="presentation"
          onClick={onCloseMobile}
          className="fixed inset-0 bg-ink/40 z-40 md:hidden backdrop-blur-sm"
        />
      )}

      <aside
        aria-label="Main Navigation"
        className={clsx(
          'fixed inset-y-0 left-0 z-40 bg-panel border-r border-hairline flex flex-col transition-all duration-200',
          // Desktop sizing: 15rem expanded, 4.25rem collapsed
          'md:static',
          isCollapsed ? 'md:w-[4.25rem]' : 'md:w-[15rem]',
          // Mobile off-canvas drawer
          isOpenMobile ? 'translate-x-0 w-[15rem]' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Brand header */}
        <div className="h-14 border-b border-hairline flex items-center justify-between px-4">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-7 h-7 rounded-sm bg-primary text-[var(--color-primary-contrast)] flex items-center justify-center font-heading font-bold text-sm flex-shrink-0">
              F
            </div>
            {(!isCollapsed || isOpenMobile) && (
              <span className="font-heading font-semibold text-base text-ink tracking-tight truncate">
                FinTrack
              </span>
            )}
          </div>
          {/* Close mobile button */}
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close menu"
            className="p-1 rounded-sm text-muted hover:text-ink md:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {ENABLED_NAV_ITEMS.map((item) => {
            const Icon = iconMap[item.icon] || Tag;

            return (
              <NavLink
                key={item.id}
                to={item.path}
                onClick={onCloseMobile}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-medium transition-colors select-none',
                    'focus-visible:outline-2 focus-visible:outline-marigold',
                    isActive
                      ? 'bg-primary text-[var(--color-primary-contrast)] font-semibold shadow-xs'
                      : 'text-ink/80 hover:bg-hairline/40 hover:text-ink'
                  )
                }
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {(!isCollapsed || isOpenMobile) && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Desktop Rail Collapse Toggle */}
        <div className="hidden md:flex p-2 border-t border-hairline justify-end">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 text-muted hover:text-ink hover:bg-hairline/40 rounded-sm transition-colors focus-visible:outline-2 focus-visible:outline-marigold"
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </aside>
    </>
  );
};
