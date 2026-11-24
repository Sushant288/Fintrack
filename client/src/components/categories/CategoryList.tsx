import React, { useState } from 'react';
import { useCategories } from '@/hooks/useCategories';
import { Category, TxType } from '@/types';
import { CategoryFilters } from './CategoryFilters';
import { CategoryRow } from './CategoryRow';
import { CategoryFormDialog } from './CategoryFormDialog';
import { DeleteCategoryDialog } from './DeleteCategoryDialog';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/context/ToastContext';
import { Tag, Plus, AlertCircle } from 'lucide-react';
import { TIMING } from '@/config/timing';

export const CategoryList: React.FC = () => {
  const [filterType, setFilterType] = useState<TxType | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, TIMING.DEBOUNCE_SEARCH_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const {
    categories,
    count,
    isLoading,
    isError,
    error,
    refetch,
    createCategory,
    updateCategory,
    deleteCategory
  } = useCategories({
    type: filterType === 'ALL' ? undefined : filterType,
    includeArchived,
    q: debouncedSearch.trim() || undefined
  });

  const toast = useToast();

  // Dialog state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);

  const handleOpenCreate = () => {
    setEditingCategory(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (cat: Category) => {
    setEditingCategory(cat);
    setIsFormOpen(true);
  };

  const handleArchiveToggle = async (cat: Category) => {
    try {
      const willArchive = !cat.isArchived;
      await updateCategory({
        id: cat.id,
        patch: { isArchived: willArchive }
      });
      toast.success(willArchive ? 'Category archived' : 'Category restored');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Operation failed';
      toast.error(msg);
    }
  };

  const handleFormSubmit = async (data: Parameters<typeof createCategory>[0]) => {
    if (editingCategory) {
      await updateCategory({
        id: editingCategory.id,
        patch: {
          name: data.name,
          color: data.color,
          icon: data.icon,
          parentId: data.parentId
        }
      });
      toast.success('Category saved');
    } else {
      await createCategory(data);
      toast.success('Category created');
    }
  };

  const handleConfirmDelete = async (categoryId: string, reassignTo?: string) => {
    const result = await deleteCategory({ id: categoryId, reassignTo });
    if (result.reassigned && (result.reassigned.transactions > 0 || result.reassigned.recurringRules > 0)) {
      const t = result.reassigned.transactions;
      const r = result.reassigned.recurringRules;
      toast.success(`Category deleted. Moved ${t} transactions and ${r} recurring rules.`);
    } else {
      toast.success('Category deleted');
    }
  };

  // Group top-level categories and sub-categories
  const topLevelCategories = categories.filter((c) => !c.parentId);
  const childMap = React.useMemo(() => {
    const map = new Map<string, Category[]>();
    categories.forEach((c) => {
      if (c.parentId) {
        const arr = map.get(c.parentId) || [];
        arr.push(c);
        map.set(c.parentId, arr);
      }
    });
    return map;
  }, [categories]);

  // Group by Expense and Income
  const expenseCategories = topLevelCategories.filter((c) => c.type === 'EXPENSE');
  const incomeCategories = topLevelCategories.filter((c) => c.type === 'INCOME');

  return (
    <div>
      {/* Filters bar */}
      <CategoryFilters
        type={filterType}
        onTypeChange={setFilterType}
        search={search}
        onSearchChange={setSearch}
        includeArchived={includeArchived}
        onIncludeArchivedChange={setIncludeArchived}
      />

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {/* Error state */}
      {!isLoading && isError && (
        <div className="p-8 text-center bg-panel border border-danger/30 rounded-md">
          <AlertCircle className="w-8 h-8 text-danger mx-auto mb-2" />
          <h3 className="font-heading font-semibold text-ink text-base mb-1">Failed to load categories</h3>
          <p className="text-sm text-muted mb-4">{error instanceof Error ? error.message : 'Please try again.'}</p>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && categories.length === 0 && (
        <EmptyState
          icon={<Tag className="w-8 h-8 text-muted" />}
          title="No categories found"
          description={
            search
              ? `No categories match "${search}". Try searching for something else.`
              : 'You have no categories set up yet.'
          }
          actionLabel="Create category"
          onAction={handleOpenCreate}
        />
      )}

      {/* Category list groups */}
      {!isLoading && !isError && categories.length > 0 && (
        <div className="space-y-8">
          {/* Summary count */}
          <div className="text-xs text-muted flex items-center justify-between pb-2 border-b border-hairline">
            <span>Showing {count} categories</span>
            <Button variant="primary" size="sm" onClick={handleOpenCreate}>
              <Plus className="w-4 h-4 mr-1" />
              New category
            </Button>
          </div>

          {/* Expense group */}
          {(filterType === 'ALL' || filterType === 'EXPENSE') && expenseCategories.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted">
                Expense Categories ({expenseCategories.length})
              </h2>
              <div className="space-y-2">
                {expenseCategories.map((cat) => (
                  <CategoryRow
                    key={cat.id}
                    category={cat}
                    childrenCategories={childMap.get(cat.id)}
                    onEdit={handleOpenEdit}
                    onArchiveToggle={handleArchiveToggle}
                    onDelete={setDeletingCategory}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Income group */}
          {(filterType === 'ALL' || filterType === 'INCOME') && incomeCategories.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted">
                Income Categories ({incomeCategories.length})
              </h2>
              <div className="space-y-2">
                {incomeCategories.map((cat) => (
                  <CategoryRow
                    key={cat.id}
                    category={cat}
                    childrenCategories={childMap.get(cat.id)}
                    onEdit={handleOpenEdit}
                    onArchiveToggle={handleArchiveToggle}
                    onDelete={setDeletingCategory}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      <CategoryFormDialog
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        category={editingCategory}
        existingCategories={categories}
        onSubmit={handleFormSubmit}
      />

      <DeleteCategoryDialog
        isOpen={Boolean(deletingCategory)}
        onClose={() => setDeletingCategory(null)}
        category={deletingCategory}
        existingCategories={categories}
        onConfirmDelete={handleConfirmDelete}
        onArchiveInstead={handleArchiveToggle}
      />
    </div>
  );
};
