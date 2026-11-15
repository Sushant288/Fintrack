// M6: Analytics controller
import { Request, Response, NextFunction } from 'express';
import * as analyticsService from '../services/analytics.service';
import { sendSuccess } from '../utils/response';

export const getOverview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const overview = await analyticsService.getOverview(req.user!.id);
    sendSuccess(res, overview);
  } catch (err) {
    next(err);
  }
};

export const getSpendingByCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await analyticsService.getSpendingByCategory(req.user!.id);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
};

export const getIncomeVsExpense = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await analyticsService.getIncomeVsExpense(req.user!.id);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
};
