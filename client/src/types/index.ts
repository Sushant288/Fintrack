// M0: Core TypeScript Types and Interfaces
export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Category {
  id: string;
  name: string;
  type: 'INCOME' | 'EXPENSE';
  icon?: string;
  color?: string;
}

export interface Transaction {
  id: string;
  categoryId: string;
  amount: number;
  type: 'INCOME' | 'EXPENSE';
  date: string;
  notes?: string;
}

export interface Budget {
  id: string;
  categoryId: string;
  amount: number;
  period: 'MONTHLY' | 'YEARLY';
}

export interface Goal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
}
