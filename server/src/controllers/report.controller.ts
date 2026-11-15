// M8: Report controller
import { Request, Response, NextFunction } from 'express';
import * as reportService from '../services/report.service';
import { sendSuccess } from '../utils/response';

export const getMonthlyReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const report = await reportService.generateMonthlyReport(req.user!.id);
    sendSuccess(res, report);
  } catch (err) {
    next(err);
  }
};
