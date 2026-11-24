import { NextFunction, Request, Response } from 'express';
import { getValidated } from '../middleware/validate';
import { RecurringService, runDueRules } from '../services/recurring.service';
import { ok } from '../utils/response';
import {
  CreateRecurringRuleInput,
  ListRecurringRulesQuery,
  UpdateRecurringRuleInput
} from '../validators/recurring.schema';

export class RecurringController {
  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { body } = getValidated<CreateRecurringRuleInput>(req);
      const result = await RecurringService.create(req.user!.id, body);
      ok(res, result.rule, { generated: result.generated, alerts: result.alerts }, 201);
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { query } = getValidated<unknown, ListRecurringRulesQuery>(req);
      const result = await RecurringService.list(req.user!.id, query);
      ok(res, result.items, result.meta, 200);
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { params } = getValidated<unknown, unknown, { id: string }>(req);
      const result = await RecurringService.getById(req.user!.id, params.id);
      ok(res, result, null, 200);
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { params, body } = getValidated<UpdateRecurringRuleInput, unknown, { id: string }>(req);
      const result = await RecurringService.update(req.user!.id, params.id, body);
      ok(res, result.rule, { generated: result.generated, alerts: result.alerts }, 200);
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { params } = getValidated<unknown, unknown, { id: string }>(req);
      const result = await RecurringService.remove(req.user!.id, params.id);
      ok(res, result, null, 200);
    } catch (err) {
      next(err);
    }
  }

  static async pause(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { params } = getValidated<unknown, unknown, { id: string }>(req);
      const result = await RecurringService.pause(req.user!.id, params.id);
      ok(res, result, null, 200);
    } catch (err) {
      next(err);
    }
  }

  static async resume(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { params } = getValidated<unknown, unknown, { id: string }>(req);
      const result = await RecurringService.resume(req.user!.id, params.id);
      ok(res, result.rule, { skippedOccurrences: result.skippedOccurrences }, 200);
    } catch (err) {
      next(err);
    }
  }

  static async processManual(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await runDueRules({ userId: req.user!.id });
      ok(
        res,
        {
          rulesProcessed: result.rulesProcessed,
          generated: result.generated,
          failed: result.failed,
          blocked: result.blocked
        },
        { alerts: result.alerts },
        200
      );
    } catch (err) {
      next(err);
    }
  }
}
