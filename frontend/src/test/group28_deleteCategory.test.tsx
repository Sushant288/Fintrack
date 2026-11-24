import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './render';
import { DeleteCategoryDialog } from '@/components/categories/DeleteCategoryDialog';
import { buildCategory } from './factories';

describe('Group 28: DELETE CATEGORY & REASSIGNMENT', () => {
  it('deletes unused category directly with simple confirmation', async () => {
    const unusedCat = buildCategory({
      id: 'c-unused',
      name: 'Unused Cat',
      type: 'EXPENSE',
      usage: { transactions: 0, recurringRules: 0, budgets: 0 }
    });

    const onConfirmDelete = vi.fn(async () => {});

    renderWithProviders(
      <DeleteCategoryDialog
        isOpen={true}
        onClose={() => {}}
        category={unusedCat}
        existingCategories={[unusedCat]}
        onConfirmDelete={onConfirmDelete}
        onArchiveInstead={async () => {}}
      />
    );

    expect(screen.getByText(/this category is unused and will be permanently removed/i)).toBeInTheDocument();

    const deleteBtn = screen.getByRole('button', { name: /^delete category$/i });
    await userEvent.click(deleteBtn);

    expect(onConfirmDelete).toHaveBeenCalledWith('c-unused', undefined);
  });

  it('requires reassign target when category has transactions and explains budget merge', async () => {
    const inUseCat = buildCategory({
      id: 'c-used',
      name: 'Used Cat',
      type: 'EXPENSE',
      usage: { transactions: 12, recurringRules: 1, budgets: 1 }
    });
    const targetCat = buildCategory({
      id: 'c-target',
      name: 'Target Cat',
      type: 'EXPENSE',
      usage: { transactions: 0, recurringRules: 0, budgets: 0 }
    });

    const onConfirmDelete = vi.fn(async () => {});

    renderWithProviders(
      <DeleteCategoryDialog
        isOpen={true}
        onClose={() => {}}
        category={inUseCat}
        existingCategories={[inUseCat, targetCat]}
        onConfirmDelete={onConfirmDelete}
        onArchiveInstead={async () => {}}
      />
    );

    expect(screen.getByText(/12 transactions/i)).toBeInTheDocument();
    expect(screen.getByText(/1 recurring rule/i)).toBeInTheDocument();
    expect(screen.getByText(/existing budgets for this category will be merged/i)).toBeInTheDocument();

    const select = screen.getByLabelText(/reassign items to:/i);
    await userEvent.selectOptions(select, 'c-target');

    const deleteBtn = screen.getByRole('button', { name: /^delete category$/i });
    await userEvent.click(deleteBtn);

    expect(onConfirmDelete).toHaveBeenCalledWith('c-used', 'c-target');
  });
});
