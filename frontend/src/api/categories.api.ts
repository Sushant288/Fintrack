import { api } from './client';
import { normalizeError } from './errors';
import { Envelope, Category, CategoryDeleteResult, TxType } from '@/types';

export interface CategoryListParams {
  type?: TxType;
  includeArchived?: boolean;
  q?: string;
}

export interface CreateCategoryInput {
  name: string;
  type: TxType;
  color?: string;
  icon?: string;
  parentId?: string | null;
}

export interface UpdateCategoryInput {
  name?: string;
  color?: string;
  icon?: string;
  isArchived?: boolean;
  parentId?: string | null;
}

export const categoriesApi = {
  async listCategories(
    params?: CategoryListParams
  ): Promise<{ categories: Category[]; count: number }> {
    try {
      const res = await api.get<Envelope<Category[], { count: number }>>('/categories', {
        params
      });
      return {
        categories: res.data.data || [],
        count: res.data.meta?.count ?? (res.data.data || []).length
      };
    } catch (err) {
      throw normalizeError(err);
    }
  },

  async createCategory(body: CreateCategoryInput): Promise<Category> {
    try {
      const res = await api.post<Envelope<Category>>('/categories', body);
      if (!res.data.data) throw new Error('Created category data missing');
      return res.data.data;
    } catch (err) {
      throw normalizeError(err);
    }
  },

  async updateCategory(id: string, patch: UpdateCategoryInput): Promise<Category> {
    try {
      const res = await api.patch<Envelope<Category>>(`/categories/${id}`, patch);
      if (!res.data.data) throw new Error('Updated category data missing');
      return res.data.data;
    } catch (err) {
      throw normalizeError(err);
    }
  },

  async deleteCategory(id: string, reassignTo?: string): Promise<CategoryDeleteResult> {
    try {
      const res = await api.delete<Envelope<CategoryDeleteResult>>(`/categories/${id}`, {
        params: reassignTo ? { reassignTo } : undefined
      });
      if (!res.data.data) throw new Error('Delete category response missing');
      return res.data.data;
    } catch (err) {
      throw normalizeError(err);
    }
  }
};
