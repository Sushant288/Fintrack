import { Request, Response } from 'express';
import * as categoryService from '../services/category.service';
import { getValidated } from '../middleware/validate';
import {
  CreateCategoryInput,
  UpdateCategoryInput,
  CategoryListQuery,
  CategoryDeleteQuery
} from '../validators/category.schema';
import { ok } from '../utils/response';

export async function listCategories(req: Request, res: Response): Promise<Response> {
  const { query } = getValidated<never, CategoryListQuery, never>(req);
  const result = await categoryService.list(req.user!.id, query);
  return ok(res, result.categories, { count: result.count }, 200);
}

export async function createCategory(req: Request, res: Response): Promise<Response> {
  const { body } = getValidated<CreateCategoryInput, never, never>(req);
  const result = await categoryService.create(req.user!.id, body);
  return ok(res, result, null, 201);
}

export async function updateCategory(req: Request, res: Response): Promise<Response> {
  const { params, body } = getValidated<UpdateCategoryInput, never, { id: string }>(req);
  const result = await categoryService.update(req.user!.id, params.id, body);
  return ok(res, result, null, 200);
}

export async function deleteCategory(req: Request, res: Response): Promise<Response> {
  const { params, query } = getValidated<never, CategoryDeleteQuery, { id: string }>(req);
  const result = await categoryService.remove(req.user!.id, params.id, query.reassignTo);
  return ok(res, result, null, 200);
}
