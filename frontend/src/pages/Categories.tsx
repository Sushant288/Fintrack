import React from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { CategoryList } from '@/components/categories/CategoryList';

export const Categories: React.FC = () => {
  usePageTitle('Categories');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-semibold text-ink">Categories</h1>
        <p className="text-sm text-muted mt-0.5">
          Manage your income and expense categories, icons, and hierarchy.
        </p>
      </div>

      <CategoryList />
    </div>
  );
};
