import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './render';
import { CategoryList } from '@/components/categories/CategoryList';
import { server } from './server';
import { http, HttpResponse } from 'msw';
import { buildEnvelope, buildCategory } from './factories';

describe('Group 25: CATEGORIES LIST & PRESENTATION', () => {
  it('displays category hierarchy, usage text, and default pills', async () => {
    const parent = buildCategory({
      id: 'p1',
      name: 'Food',
      type: 'EXPENSE',
      color: '#ef4444',
      icon: 'utensils',
      isDefault: true,
      usage: { transactions: 5, recurringRules: 1, budgets: 1 }
    });
    const child = buildCategory({
      id: 'c1',
      parentId: 'p1',
      name: 'Groceries',
      type: 'EXPENSE',
      color: '#ef4444',
      icon: 'shopping-bag',
      isDefault: false,
      usage: { transactions: 0, recurringRules: 0, budgets: 0 }
    });

    server.use(
      http.get('http://localhost:4000/api/v1/categories', () => {
        return HttpResponse.json(buildEnvelope([parent, child], { count: 2 }));
      })
    );

    renderWithProviders(<CategoryList />);

    await waitFor(() => {
      expect(screen.getByText('Food')).toBeInTheDocument();
      expect(screen.getByText('Groceries')).toBeInTheDocument();
      expect(screen.getByText(/5 transactions, 1 recurring rule, 1 budget/i)).toBeInTheDocument();
      expect(screen.getByText('No activity yet')).toBeInTheDocument();
      expect(screen.getByText('Default')).toBeInTheDocument();
    });
  });

  it('renders EmptyState when categories list is empty', async () => {
    server.use(
      http.get('http://localhost:4000/api/v1/categories', () => {
        return HttpResponse.json(buildEnvelope([], { count: 0 }));
      })
    );

    renderWithProviders(<CategoryList />);

    await waitFor(() => {
      expect(screen.getByText(/no categories found/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create category/i })).toBeInTheDocument();
    });
  });
});
