// M3: Alert controller
import { Request, Response, NextFunction } from 'express';
import * as alertService from '../services/alert.service';
import { sendSuccess } from '../utils/response';

export const getAlerts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const alerts = await alertService.getAll(req.user!.id);
    sendSuccess(res, alerts);
  } catch (err) {
    next(err);
  }
};

export const markAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const alert = await alertService.markAsRead(req.user!.id, req.params.id);
    sendSuccess(res, alert);
  } catch (err) {
    next(err);
  }
};
