import { SafeUser, Category, Envelope, ApiErrorBody } from '@/types';

export function buildUser(overrides: Partial<SafeUser> = {}): SafeUser {
  return {
    id: 'user-uuid-1',
    name: 'Sushant Patil',
    email: 'sushant@example.com',
    currency: 'USD',
    timezone: 'UTC',
    alertThresholds: [80, 100],
    alertInAppEnabled: true,
    alertEmailEnabled: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

export function buildCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-uuid-1',
    userId: 'user-uuid-1',
    name: 'Groceries',
    type: 'EXPENSE',
    color: '#ef4444',
    icon: 'utensils',
    isDefault: false,
    isArchived: false,
    parentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usage: {
      transactions: 0,
      recurringRules: 0,
      budgets: 0
    },
    canDelete: true,
    ...overrides
  };
}

export function buildEnvelope<T, M = unknown>(
  data: T | null,
  meta: M | null = null,
  error: ApiErrorBody | null = null
): Envelope<T, M> {
  return {
    data,
    meta,
    error
  };
}
