import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Category } from '@/types';
import { categoryFormSchema, CategoryFormInput } from '@/utils/validators';
import { ColorPicker } from './ColorPicker';
import { IconPicker } from './IconPicker';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Select } from '@/components/ui/Select';
import { ERROR_CODES } from '@/api/errorCodes';
import { ApiClientError } from '@/api/errors';
import { DEFAULT_CATEGORY_COLOR } from '@/config/palette';

export interface CategoryFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  category?: Category | null;
  existingCategories: Category[];
  onSubmit: (data: CategoryFormInput) => Promise<void>;
  isLoading?: boolean;
}

export const CategoryFormDialog: React.FC<CategoryFormDialogProps> = ({
  isOpen,
  onClose,
  category,
  existingCategories,
  onSubmit,
  isLoading = false
}) => {
  const isEditing = Boolean(category);
  const [formLevelError, setFormLevelError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    setError,
    formState: { errors }
  } = useForm<CategoryFormInput>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: '',
      type: 'EXPENSE',
      color: DEFAULT_CATEGORY_COLOR,
      icon: 'tag',
      parentId: null
    }
  });

  const selectedType = watch('type');
  const selectedColor = watch('color');
  const selectedIcon = watch('icon');
  const selectedParentId = watch('parentId');

  useEffect(() => {
    if (category) {
      reset({
        name: category.name,
        type: category.type,
        color: category.color,
        icon: category.icon,
        parentId: category.parentId
      });
    } else {
      reset({
        name: '',
        type: 'EXPENSE',
        color: DEFAULT_CATEGORY_COLOR,
        icon: 'tag',
        parentId: null
      });
    }
    setFormLevelError(null);
  }, [category, isOpen, reset]);

  // Candidates for parent category:
  // Must be same type, non-archived, top-level (parentId === null), and not self
  const parentCandidates = existingCategories.filter(
    (c) =>
      c.type === selectedType &&
      !c.isArchived &&
      !c.parentId &&
      (!category || c.id !== category.id)
  );

  // Check if current category has children (if it does, it cannot become a child itself because max depth is 2)
  const hasChildren = category
    ? existingCategories.some((c) => c.parentId === category.id)
    : false;

  const handleFormSubmit = async (values: CategoryFormInput) => {
    setFormLevelError(null);
    try {
      await onSubmit(values);
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === ERROR_CODES.CATEGORY_NAME_TAKEN) {
          setError('name', { message: 'A category with this name already exists for this type' });
          return;
        }
        if (err.code === ERROR_CODES.INVALID_PARENT) {
          setError('parentId', { message: 'Invalid parent category selected' });
          return;
        }
        if (err.code === ERROR_CODES.PARENT_ARCHIVED) {
          setError('parentId', { message: 'Selected parent category is archived' });
          return;
        }
        if (err.code === ERROR_CODES.CATEGORY_LIMIT_REACHED) {
          setFormLevelError('Maximum number of categories allowed has been reached.');
          return;
        }
        if (err.fieldErrors.length > 0) {
          err.fieldErrors.forEach((fe) => {
            setError(fe.field as keyof CategoryFormInput, { message: fe.message });
          });
          return;
        }
        setFormLevelError(err.message);
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Category' : 'New Category'}
      description={isEditing ? 'Update category name, icon or color.' : 'Create a new expense or income category.'}
    >
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        {formLevelError && (
          <div role="alert" className="p-3 text-xs bg-danger/10 border border-danger/20 text-danger rounded-sm">
            {formLevelError}
          </div>
        )}

        {/* Name */}
        <Input
          label="Category Name"
          placeholder="e.g. Groceries"
          error={errors.name?.message}
          {...register('name')}
        />

        {/* Type (Disabled on edit) */}
        <FormField label="Type" error={errors.type?.message}>
          <div className="flex gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
              <input
                type="radio"
                value="EXPENSE"
                disabled={isEditing}
                checked={selectedType === 'EXPENSE'}
                onChange={() => setValue('type', 'EXPENSE')}
                className="text-primary focus:ring-marigold"
              />
              Expense
            </label>
            <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
              <input
                type="radio"
                value="INCOME"
                disabled={isEditing}
                checked={selectedType === 'INCOME'}
                onChange={() => setValue('type', 'INCOME')}
                className="text-primary focus:ring-marigold"
              />
              Income
            </label>
          </div>
          {isEditing && (
            <p className="text-xs text-muted mt-1">Type cannot be changed after creation.</p>
          )}
        </FormField>

        {/* Parent Category (hidden if has children) */}
        {!hasChildren && parentCandidates.length > 0 && (
          <Select
            label="Parent Category (Optional)"
            value={selectedParentId || ''}
            onChange={(e) => setValue('parentId', e.target.value ? e.target.value : null)}
            error={errors.parentId?.message}
            options={[
              { value: '', label: 'None (Top-level category)' },
              ...parentCandidates.map((c) => ({ value: c.id, label: c.name }))
            ]}
          />
        )}

        {/* Color Picker */}
        <FormField label="Color" error={errors.color?.message}>
          <ColorPicker value={selectedColor} onChange={(c) => setValue('color', c)} />
        </FormField>

        {/* Icon Picker */}
        <FormField label="Icon" error={errors.icon?.message}>
          <IconPicker value={selectedIcon} onChange={(slug) => setValue('icon', slug)} />
        </FormField>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-hairline">
          <Button variant="secondary" type="button" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" isLoading={isLoading}>
            {isEditing ? 'Save changes' : 'Create category'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
