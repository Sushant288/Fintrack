// M4: Recurring controller
import { Request, Response, NextFunction } from 'express';
import * as recurringService from '../services/recurring.service';
import { sendSuccess } from '../utils/response';

export const getRecurringTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await recurringService.getAll(req.user!.id);
    sendSuccess(res, items);
  } catch (err) {
    next(err);
  }
};

export const createRecurringTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await recurringService.create(req.user!.id, req.body);
    sendSuccess(res, item, 201);
  } catch (err) {
    next(err);
  }
};

export const updateRecurringTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await recurringService.update(req.user!.id, req.params.id, req.body);
    sendSuccess(res, item);
  } catch (err) {
    next(err);
  }
};

export const deleteRecurringTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await recurringService.remove(req.user!.id, req.params.id);
    sendSuccess(res, { message: 'Recurring transaction deleted' });
  } catch (err) {
    next(err);
  }
};
