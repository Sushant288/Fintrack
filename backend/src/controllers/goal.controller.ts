import { NextFunction, Request, Response } from 'express';
import { getValidated } from '../middleware/validate';
import { GoalService } from '../services/goal.service';
import { ok } from '../utils/response';
import {
  ContributeGoalInput,
  CreateGoalInput,
  ListContributionsQuery,
  ListGoalsQuery,
  UpdateGoalInput
} from '../validators/goal.schema';

export class GoalController {
  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { body } = getValidated<CreateGoalInput>(req);
      const result = await GoalService.create(req.user!.id, body);
      ok(res, result, null, 201);
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { query } = getValidated<unknown, ListGoalsQuery>(req);
      const result = await GoalService.list(req.user!.id, query);
      ok(res, result.items, result.meta, 200);
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { params } = getValidated<unknown, unknown, { id: string }>(req);
      const result = await GoalService.getById(req.user!.id, params.id);
      ok(res, result, null, 200);
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { params, body } = getValidated<UpdateGoalInput, unknown, { id: string }>(req);
      const result = await GoalService.update(req.user!.id, params.id, body);
      ok(res, result, null, 200);
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { params } = getValidated<unknown, unknown, { id: string }>(req);
      const result = await GoalService.remove(req.user!.id, params.id);
      ok(res, result, null, 200);
    } catch (err) {
      next(err);
    }
  }

  static async archive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { params } = getValidated<unknown, unknown, { id: string }>(req);
      const result = await GoalService.archive(req.user!.id, params.id);
      ok(res, result, null, 200);
    } catch (err) {
      next(err);
    }
  }

  static async unarchive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { params } = getValidated<unknown, unknown, { id: string }>(req);
      const result = await GoalService.unarchive(req.user!.id, params.id);
      ok(res, result, null, 200);
    } catch (err) {
      next(err);
    }
  }

  static async contribute(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { params, body } = getValidated<ContributeGoalInput, unknown, { id: string }>(req);
      const result = await GoalService.contribute(req.user!.id, params.id, body);
      ok(
        res,
        { contribution: result.contribution, goal: result.goal },
        { alerts: result.alerts },
        201
      );
    } catch (err) {
      next(err);
    }
  }

  static async listContributions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { params, query } = getValidated<unknown, ListContributionsQuery, { id: string }>(req);
      const result = await GoalService.listContributions(req.user!.id, params.id, query);
      ok(res, result.items, result.meta, 200);
    } catch (err) {
      next(err);
    }
  }
}
