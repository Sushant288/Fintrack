import React from 'react';
import { TxType } from '@/types';
import { clsx } from 'clsx';
import { Search } from 'lucide-react';
import { Switch } from '@/components/ui/Switch';

export interface CategoryFiltersProps {
  type: TxType | 'ALL';
  onTypeChange: (type: TxType | 'ALL') => void;
  search: string;
  onSearchChange: (q: string) => void;
  includeArchived: boolean;
  onIncludeArchivedChange: (include: boolean) => void;
}

export const CategoryFilters: React.FC<CategoryFiltersProps> = ({
  type,
  onTypeChange,
  search,
  onSearchChange,
  includeArchived,
  onIncludeArchivedChange
}) => {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 bg-panel border border-hairline rounded-md mb-6">
      {/* Type Tabs */}
      <div className="flex bg-paper p-1 rounded-sm border border-hairline self-start">
        {(['ALL', 'EXPENSE', 'INCOME'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTypeChange(t)}
            className={clsx(
              'px-3 py-1 text-xs font-medium rounded-sm transition-colors capitalize select-none',
              'focus-visible:outline-2 focus-visible:outline-marigold',
              type === t
                ? 'bg-panel text-ink shadow-xs font-semibold'
                : 'text-muted hover:text-ink'
            )}
          >
            {t.toLowerCase()}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
        {/* Search input */}
        <div className="relative min-w-[200px]">
          <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search categories..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-panel text-ink border border-hairline rounded-sm focus-visible:outline-2 focus-visible:outline-marigold"
          />
        </div>

        {/* Include archived switch */}
        <div className="flex items-center">
          <Switch
            label="Show archived"
            checked={includeArchived}
            onChange={onIncludeArchivedChange}
          />
        </div>
      </div>
    </div>
  );
};
