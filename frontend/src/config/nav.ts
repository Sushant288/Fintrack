import { ROUTES } from './routes';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: string;
  module: 'F1' | 'F2' | 'F3' | 'F4';
  enabled: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: ROUTES.HOME, icon: 'layout-dashboard', module: 'F1', enabled: true },
  { id: 'categories', label: 'Categories', path: ROUTES.CATEGORIES, icon: 'tag', module: 'F1', enabled: true },
  { id: 'settings', label: 'Settings', path: ROUTES.SETTINGS, icon: 'settings', module: 'F1', enabled: true },
  { id: 'transactions', label: 'Transactions', path: '/transactions', icon: 'receipt', module: 'F2', enabled: false },
  { id: 'budgets', label: 'Budgets', path: '/budgets', icon: 'pie-chart', module: 'F2', enabled: false },
  { id: 'recurring', label: 'Recurring', path: '/recurring', icon: 'repeat', module: 'F3', enabled: false },
  { id: 'goals', label: 'Goals', path: '/goals', icon: 'target', module: 'F3', enabled: false },
  { id: 'analytics', label: 'Analytics', path: '/analytics', icon: 'bar-chart-3', module: 'F4', enabled: false },
  { id: 'reports', label: 'Reports', path: '/reports', icon: 'file-text', module: 'F4', enabled: false }
];

export const ENABLED_NAV_ITEMS = NAV_ITEMS.filter((item) => item.enabled);
