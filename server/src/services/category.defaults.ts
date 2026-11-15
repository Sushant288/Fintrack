export interface DefaultCategory {
  name: string;
  type: 'INCOME' | 'EXPENSE';
  color: string;
  icon: string;
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  // EXPENSE Categories (11)
  { name: 'Food', type: 'EXPENSE', color: '#ef4444', icon: 'utensils' },
  { name: 'Rent', type: 'EXPENSE', color: '#f97316', icon: 'home' },
  { name: 'Transport', type: 'EXPENSE', color: '#f59e0b', icon: 'car' },
  { name: 'Utilities', type: 'EXPENSE', color: '#10b981', icon: 'zap' },
  { name: 'Entertainment', type: 'EXPENSE', color: '#06b6d4', icon: 'film' },
  { name: 'Health', type: 'EXPENSE', color: '#3b82f6', icon: 'heart-pulse' },
  { name: 'Shopping', type: 'EXPENSE', color: '#6366f1', icon: 'shopping-bag' },
  { name: 'Education', type: 'EXPENSE', color: '#8b5cf6', icon: 'book-open' },
  { name: 'Travel', type: 'EXPENSE', color: '#ec4899', icon: 'plane' },
  { name: 'Subscriptions', type: 'EXPENSE', color: '#14b8a6', icon: 'repeat' },
  { name: 'Other', type: 'EXPENSE', color: '#64748b', icon: 'more-horizontal' },

  // INCOME Categories (6)
  { name: 'Salary', type: 'INCOME', color: '#22c55e', icon: 'briefcase' },
  { name: 'Freelance', type: 'INCOME', color: '#059669', icon: 'laptop' },
  { name: 'Business', type: 'INCOME', color: '#2563eb', icon: 'building' },
  { name: 'Investments', type: 'INCOME', color: '#7c3aed', icon: 'trending-up' },
  { name: 'Gifts', type: 'INCOME', color: '#f43f5e', icon: 'gift' },
  { name: 'Other', type: 'INCOME', color: '#94a3b8', icon: 'dollar-sign' }
];
