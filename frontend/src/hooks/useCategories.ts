import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  categoriesApi,
  CategoryListParams,
  CreateCategoryInput,
  UpdateCategoryInput
} from '@/api/categories.api';
import { queryKeys } from '@/api/queryKeys';

export function useCategories(params?: CategoryListParams) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.categories.list(params || {}),
    queryFn: () => categoriesApi.listCategories(params)
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateCategoryInput) => categoriesApi.createCategory(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories.all() });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateCategoryInput }) =>
      categoriesApi.updateCategory(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories.all() });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, reassignTo }: { id: string; reassignTo?: string }) =>
      categoriesApi.deleteCategory(id, reassignTo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories.all() });
    }
  });

  return {
    ...query,
    categories: query.data?.categories || [],
    count: query.data?.count ?? 0,
    createCategory: createMutation.mutateAsync,
    updateCategory: updateMutation.mutateAsync,
    deleteCategory: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending
  };
}
