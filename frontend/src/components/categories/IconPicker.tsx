import React, { useState } from 'react';
import { CATEGORY_ICONS, CATEGORY_ICON_SLUGS } from '@/config/categoryIcons';
import { clsx } from 'clsx';
import { Search } from 'lucide-react';

export interface IconPickerProps {
  value: string;
  onChange: (slug: string) => void;
}

export const IconPicker: React.FC<IconPickerProps> = ({ value, onChange }) => {
  const [search, setSearch] = useState('');

  const filteredSlugs = CATEGORY_ICON_SLUGS.filter((slug) =>
    slug.toLowerCase().includes(search.toLowerCase().trim())
  );

  return (
    <div className="space-y-2">
      {/* Search filter */}
      <div className="relative">
        <Search className="w-4 h-4 text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter icons..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-panel text-ink border border-hairline rounded-sm focus-visible:outline-2 focus-visible:outline-marigold"
        />
      </div>

      {/* Icon buttons grid */}
      <div
        role="radiogroup"
        aria-label="Category icons"
        className="grid grid-cols-7 sm:grid-cols-9 gap-1.5 max-h-40 overflow-y-auto p-1 border border-hairline rounded-sm bg-panel"
      >
        {filteredSlugs.map((slug) => {
          const Icon = CATEGORY_ICONS[slug];
          const isSelected = value === slug;

          return (
            <button
              key={slug}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`Icon ${slug}`}
              onClick={() => onChange(slug)}
              className={clsx(
                'p-2 rounded-sm flex items-center justify-center transition-colors',
                'focus-visible:outline-2 focus-visible:outline-marigold',
                isSelected
                  ? 'bg-primary text-[var(--color-primary-contrast)] shadow-xs'
                  : 'text-muted hover:text-ink hover:bg-hairline/40'
              )}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
        {filteredSlugs.length === 0 && (
          <p className="col-span-full py-4 text-center text-xs text-muted">No icons match "{search}"</p>
        )}
      </div>
    </div>
  );
};
