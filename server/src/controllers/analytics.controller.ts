import { Request, Response } from 'express';
import { AnalyticsService } from '../services/analytics.service';
import { ok } from '../utils/response';
import { getValidated } from '../middleware/validate';
import {
  BudgetVsActualQuery,
  CategoryBreakdownQuery,
  SummaryQuery,
  TrendQuery
} from '../validators/analytics.schema';

export class AnalyticsController {
  static async getSummary(req: Request, res: Response) {
    const query = getValidated<any, SummaryQuery>(req).query;
    const data = await AnalyticsService.getSummary(req.user!.id, query);
    return ok(res, data);
  }

  static async getCategoryBreakdown(req: Request, res: Response) {
    const query = getValidated<any, CategoryBreakdownQuery>(req).query;
    const data = await AnalyticsService.getCategoryBreakdown(req.user!.id, query);
    return ok(res, data);
  }

  static async getTrend(req: Request, res: Response) {
    const query = getValidated<any, TrendQuery>(req).query;
    const data = await AnalyticsService.getTrend(req.user!.id, query);
    return ok(res, data);
  }

  static async getBudgetVsActual(req: Request, res: Response) {
    const query = getValidated<any, BudgetVsActualQuery>(req).query;
    const data = await AnalyticsService.getBudgetVsActual(req.user!.id, query);
    return ok(res, data);
  }
}
