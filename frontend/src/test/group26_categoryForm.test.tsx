import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './render';
import { CategoryFormDialog } from '@/components/categories/CategoryFormDialog';
import { buildCategory } from './factories';
import { ApiClientError } from '@/api/errors';
import { ERROR_CODES } from '@/api/errorCodes';

describe('Group 26: CATEGORY FORM & MUTATION CONTRACT', () => {
  it('disables type radio on edit with explanatory helper text', () => {
    const existing = buildCategory({ id: 'c-1', name: 'Existing', type: 'EXPENSE' });

    renderWithProviders(
      <CategoryFormDialog
        isOpen={true}
        onClose={() => {}}
        category={existing}
        existingCategories={[existing]}
        onSubmit={async () => {}}
      />
    );

    const expenseRadio = screen.getByRole('radio', { name: /expense/i });
    const incomeRadio = screen.getByRole('radio', { name: /income/i });

    expect(expenseRadio).toBeDisabled();
    expect(incomeRadio).toBeDisabled();
    expect(screen.getByText(/type cannot be changed after creation/i)).toBeInTheDocument();
  });

  it('maps CATEGORY_NAME_TAKEN to the name input error', async () => {
    const onSubmit = vi.fn(async () => {
      throw new ApiClientError({
        status: 409,
        code: ERROR_CODES.CATEGORY_NAME_TAKEN,
        message: 'A category with this name already exists'
      });
    });

    renderWithProviders(
      <CategoryFormDialog
        isOpen={true}
        onClose={() => {}}
        existingCategories={[]}
        onSubmit={onSubmit}
      />
    );

    await userEvent.type(screen.getByLabelText(/category name/i), 'Duplicate');
    await userEvent.click(screen.getByRole('button', { name: /create category/i }));

    await waitFor(() => {
      expect(screen.getByText(/already exists for this type/i)).toBeInTheDocument();
    });
  });

  it('displays form-level alert on CATEGORY_LIMIT_REACHED', async () => {
    const onSubmit = vi.fn(async () => {
      throw new ApiClientError({
        status: 400,
        code: ERROR_CODES.CATEGORY_LIMIT_REACHED,
        message: 'Limit reached'
      });
    });

    renderWithProviders(
      <CategoryFormDialog
        isOpen={true}
        onClose={() => {}}
        existingCategories={[]}
        onSubmit={onSubmit}
      />
    );

    await userEvent.type(screen.getByLabelText(/category name/i), 'Another');
    await userEvent.click(screen.getByRole('button', { name: /create category/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/maximum number of categories/i);
    });
  });
});
