import { NextFunction, Request, Response } from 'express';
import { getValidated } from '../middleware/validate';
import {
  CopyBudgetInput,
  DeleteOverallBudgetQuery,
  UpsertBudgetInput,
  UpsertOverallBudgetInput,
  ViewBudgetQuery
} from '../validators/budget.schema';
import { ok } from '../utils/response';
import { BudgetService } from '../services/budget.service';

export class BudgetController {
  static async view(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { query } = getValidated<unknown, ViewBudgetQuery>(req);
      const { month, year, items, overall, meta } = await BudgetService.view(
        req.user!.id,
        query.month,
        query.year
      );
      ok(res, { month, year, items, overall }, meta, 200);
    } catch (err) {
      next(err);
    }
  }

  static async upsert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { body } = getValidated<UpsertBudgetInput>(req);
      const { item, created, alerts } = await BudgetService.upsertBudget(req.user!.id, body);
      const status = created ? 201 : 200;
      ok(res, item, { alerts }, status);
    } catch (err) {
      next(err);
    }
  }

  static async deleteBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { params } = getValidated<unknown, unknown, { id: string }>(req);
      const result = await BudgetService.deleteBudget(req.user!.id, params.id);
      ok(res, result, null, 200);
    } catch (err) {
      next(err);
    }
  }

  static async upsertOverall(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { body } = getValidated<UpsertOverallBudgetInput>(req);
      const overall = await BudgetService.upsertOverall(req.user!.id, body);
      ok(res, overall, null, 200);
    } catch (err) {
      next(err);
    }
  }

  static async deleteOverall(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { query } = getValidated<unknown, DeleteOverallBudgetQuery>(req);
      const result = await BudgetService.deleteOverall(req.user!.id, query.month, query.year);
      ok(res, result, null, 200);
    } catch (err) {
      next(err);
    }
  }

  static async copy(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { body } = getValidated<CopyBudgetInput>(req);
      const { data, alerts } = await BudgetService.copy(req.user!.id, body);
      ok(res, data, { alerts }, 200);
    } catch (err) {
      next(err);
    }
  }
}
