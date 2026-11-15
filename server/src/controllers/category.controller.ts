// M1: Category controller
import { Request, Response, NextFunction } from 'express';
import * as categoryService from '../services/category.service';
import { sendSuccess } from '../utils/response';

export const getCategories = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await categoryService.getAll(req.user!.id);
    sendSuccess(res, categories);
  } catch (err) {
    next(err);
  }
};

export const createCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const category = await categoryService.create(req.user!.id, req.body);
    sendSuccess(res, category, 201);
  } catch (err) {
    next(err);
  }
};

export const updateCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const category = await categoryService.update(req.user!.id, req.params.id, req.body);
    sendSuccess(res, category);
  } catch (err) {
    next(err);
  }
};

export const deleteCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await categoryService.remove(req.user!.id, req.params.id);
    sendSuccess(res, { message: 'Category deleted' });
  } catch (err) {
    next(err);
  }
};
