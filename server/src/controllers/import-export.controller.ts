// M7: Import/Export controller
import { Request, Response, NextFunction } from 'express';
import * as csvService from '../services/csv.service';
import { sendSuccess } from '../utils/response';

export const importCSV = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await csvService.importTransactions(req.user!.id, req.file);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

export const exportCSV = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const csvData = await csvService.exportTransactions(req.user!.id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
    res.send(csvData);
  } catch (err) {
    next(err);
  }
};
