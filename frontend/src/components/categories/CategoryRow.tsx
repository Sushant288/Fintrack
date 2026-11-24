import React from 'react';
import { Category } from '@/types';
import { getCategoryIcon } from '@/config/categoryIcons';
import { formatPlural } from '@/utils/formatters';
import { Edit2, Archive, RotateCcw, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';

export interface CategoryRowProps {
  category: Category;
  childrenCategories?: Category[];
  onEdit: (cat: Category) => void;
  onArchiveToggle: (cat: Category) => void;
  onDelete: (cat: Category) => void;
  isChild?: boolean;
}

export const CategoryRow: React.FC<CategoryRowProps> = ({
  category,
  childrenCategories = [],
  onEdit,
  onArchiveToggle,
  onDelete,
  isChild = false
}) => {
  const Icon = getCategoryIcon(category.icon);

  // Plain-words usage description with exact pluralization
  const usageDesc = React.useMemo(() => {
    if (!category.usage) return 'No activity yet';
    const { transactions, recurringRules, budgets } = category.usage;
    if (transactions === 0 && recurringRules === 0 && budgets === 0) {
      return 'No activity yet';
    }

    const parts: string[] = [];
    if (transactions > 0) {
      parts.push(formatPlural(transactions, { one: 'transaction', other: 'transactions' }));
    }
    if (recurringRules > 0) {
      parts.push(formatPlural(recurringRules, { one: 'recurring rule', other: 'recurring rules' }));
    }
    if (budgets > 0) {
      parts.push(formatPlural(budgets, { one: 'budget', other: 'budgets' }));
    }
    return parts.join(', ');
  }, [category.usage]);

  return (
    <div className="space-y-1">
      <div
        className={clsx(
          'relative flex items-center justify-between p-3 bg-panel border border-hairline rounded-md transition-colors',
          category.isArchived && 'opacity-60 bg-paper/60',
          isChild && 'ml-6 sm:ml-8 before:absolute before:-left-4 before:top-1/2 before:w-4 before:h-[1px] before:bg-hairline'
        )}
      >
        {/* Left 6px colored tab */}
        <div
          aria-hidden="true"
          className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-md"
          style={{ backgroundColor: category.color }}
        />

        {/* Category info */}
        <div className="flex items-center gap-3 pl-2 min-w-0">
          <div
            className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${category.color}15`, color: category.color }}
          >
            <Icon className="w-5 h-5" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-ink text-sm truncate">{category.name}</span>
              {category.isDefault && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-hairline/60 text-muted">
                  Default
                </span>
              )}
              {category.isArchived && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-warning/20 text-warning">
                  Archived
                </span>
              )}
            </div>
            <p className="text-xs text-muted mt-0.5 truncate">{usageDesc}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(category)}
            aria-label={`Edit category ${category.name}`}
            className="p-1.5 rounded-sm text-muted hover:text-ink hover:bg-hairline/40 transition-colors focus-visible:outline-2 focus-visible:outline-marigold"
          >
            <Edit2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onArchiveToggle(category)}
            aria-label={category.isArchived ? `Restore category ${category.name}` : `Archive category ${category.name}`}
            title={category.isArchived ? 'Restore category' : 'Archive category'}
            className="p-1.5 rounded-sm text-muted hover:text-ink hover:bg-hairline/40 transition-colors focus-visible:outline-2 focus-visible:outline-marigold"
          >
            {category.isArchived ? <RotateCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => onDelete(category)}
            aria-label={`Delete category ${category.name}`}
            className="p-1.5 rounded-sm text-muted hover:text-danger hover:bg-danger/10 transition-colors focus-visible:outline-2 focus-visible:outline-marigold"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Children indented under parent */}
      {childrenCategories.length > 0 && (
        <div className="space-y-1 relative before:absolute before:left-4 before:top-0 before:bottom-3 before:w-[1px] before:bg-hairline">
          {childrenCategories.map((child) => (
            <CategoryRow
              key={child.id}
              category={child}
              onEdit={onEdit}
              onArchiveToggle={onArchiveToggle}
              onDelete={onDelete}
              isChild
            />
          ))}
        </div>
      )}
    </div>
  );
};
