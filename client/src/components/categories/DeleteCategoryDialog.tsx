import React, { useState } from 'react';
import { Category } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { formatPlural } from '@/utils/formatters';
import { ERROR_CODES } from '@/api/errorCodes';
import { ApiClientError } from '@/api/errors';

export interface DeleteCategoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  category: Category | null;
  existingCategories: Category[];
  onConfirmDelete: (categoryId: string, reassignTo?: string) => Promise<void>;
  onArchiveInstead: (category: Category) => Promise<void>;
  isLoading?: boolean;
}

export const DeleteCategoryDialog: React.FC<DeleteCategoryDialogProps> = ({
  isOpen,
  onClose,
  category,
  existingCategories,
  onConfirmDelete,
  onArchiveInstead,
  isLoading = false
}) => {
  const [reassignTo, setReassignTo] = useState<string>('');
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [forceInUse, setForceInUse] = useState(false);

  if (!category) return null;

  const usage = category.usage || { transactions: 0, recurringRules: 0, budgets: 0 };
  const isInUse = forceInUse || usage.transactions > 0 || usage.recurringRules > 0 || usage.budgets > 0;

  // Candidates for reassignment: same type, non-archived, not self
  const reassignCandidates = existingCategories.filter(
    (c) => c.id !== category.id && c.type === category.type && !c.isArchived
  );

  const handleDelete = async () => {
    setInlineError(null);
    if (isInUse && !reassignTo) {
      setInlineError('Please select a category to reassign existing items to.');
      return;
    }

    try {
      await onConfirmDelete(category.id, isInUse ? reassignTo : undefined);
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === ERROR_CODES.CATEGORY_IN_USE) {
          setForceInUse(true);
          setInlineError('This category is currently in use. Please select a reassignment target.');
          return;
        }
        if (err.code === ERROR_CODES.INVALID_REASSIGN_TARGET) {
          setInlineError('The selected reassignment target is invalid. Please select another category.');
          return;
        }
        if (err.code === ERROR_CODES.CATEGORY_NOT_FOUND) {
          setInlineError('Category was not found.');
          return;
        }
        setInlineError(err.message);
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Delete ${category.name}`}
    >
      <div className="space-y-4">
        {inlineError && (
          <div role="alert" className="p-3 text-xs bg-danger/10 border border-danger/20 text-danger rounded-sm">
            {inlineError}
          </div>
        )}

        {!isInUse ? (
          <p className="text-sm text-muted leading-relaxed">
            Are you sure you want to delete <strong className="text-ink">{category.name}</strong>? This category is unused and will be permanently removed.
          </p>
        ) : (
          <div className="space-y-3 text-sm text-muted leading-relaxed">
            <p>
              <strong className="text-ink">{category.name}</strong> is in use with{' '}
              {usage.transactions > 0 && <span>{formatPlural(usage.transactions, { one: '1 transaction', other: `${usage.transactions} transactions` })}</span>}
              {usage.transactions > 0 && usage.recurringRules > 0 && ', '}
              {usage.recurringRules > 0 && <span>{formatPlural(usage.recurringRules, { one: '1 recurring rule', other: `${usage.recurringRules} recurring rules` })}</span>}
              .
            </p>
            <p className="text-xs bg-paper p-3 rounded-sm border border-hairline">
              Reassigning moves all associated transactions and recurring rules to the chosen category. Existing budgets for this category will be merged into the target's budgets, and any sub-categories will become top-level categories.
            </p>

            <Select
              label="Reassign items to:"
              value={reassignTo}
              onChange={(e) => setReassignTo(e.target.value)}
              options={[
                { value: '', label: 'Select a replacement category...' },
                ...reassignCandidates.map((c) => ({ value: c.id, label: c.name }))
              ]}
            />
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-hairline">
          <Button
            type="button"
            variant="ghost"
            onClick={async () => {
              await onArchiveInstead(category);
              onClose();
            }}
            disabled={isLoading}
          >
            Archive category instead
          </Button>

          <div className="flex items-center gap-2 self-end">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleDelete}
              isLoading={isLoading}
              disabled={isInUse && !reassignTo}
            >
              Delete category
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
