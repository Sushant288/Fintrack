// M3: Budget controller
import { Request, Response, NextFunction } from 'express';
import * as budgetService from '../services/budget.service';
import { sendSuccess } from '../utils/response';

export const getBudgets = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const budgets = await budgetService.getAll(req.user!.id);
    sendSuccess(res, budgets);
  } catch (err) {
    next(err);
  }
};

export const createBudget = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const budget = await budgetService.create(req.user!.id, req.body);
    sendSuccess(res, budget, 201);
  } catch (err) {
    next(err);
  }
};

export const updateBudget = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const budget = await budgetService.update(req.user!.id, req.params.id, req.body);
    sendSuccess(res, budget);
  } catch (err) {
    next(err);
  }
};

export const deleteBudget = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await budgetService.remove(req.user!.id, req.params.id);
    sendSuccess(res, { message: 'Budget deleted' });
  } catch (err) {
    next(err);
  }
};
