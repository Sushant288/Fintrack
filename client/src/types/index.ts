export type TxType = 'INCOME' | 'EXPENSE';

export interface Envelope<T = unknown, M = unknown> {
  data: T | null;
  meta: M | null;
  error: ApiErrorBody | null;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface FieldError {
  field: string;
  message: string;
}

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  currency: string;
  timezone: string;
  alertThresholds: number[];
  alertInAppEnabled: boolean;
  alertEmailEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SessionData {
  user: SafeUser;
  accessToken: string;
  expiresIn: number;
}

export interface CategoryUsage {
  transactions: number;
  recurringRules: number;
  budgets: number;
}

export interface Category {
  id: string;
  userId: string;
  name: string;
  type: TxType;
  color: string;
  icon: string;
  isDefault: boolean;
  isArchived: boolean;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  usage?: CategoryUsage;
  canDelete?: boolean;
}

export interface CategoryDeleteResult {
  deleted: boolean;
  reassigned?: {
    transactions: number;
    recurringRules: number;
    budgetsMoved: number;
    budgetsMerged: number;
  };
}
