import { NextFunction, Request, Response } from 'express';
import { getValidated } from '../middleware/validate';
import { ListAlertsQuery } from '../validators/alert.schema';
import { ok } from '../utils/response';
import { AlertService } from '../services/alert.service';

export class AlertController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { query } = getValidated<unknown, ListAlertsQuery>(req);
      const { items, meta } = await AlertService.list(req.user!.id, query);
      ok(res, items, meta, 200);
    } catch (err) {
      next(err);
    }
  }

  static async unreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AlertService.unreadCount(req.user!.id);
      ok(res, result, null, 200);
    } catch (err) {
      next(err);
    }
  }

  static async markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { params } = getValidated<unknown, unknown, { id: string }>(req);
      const alert = await AlertService.markRead(req.user!.id, params.id);
      ok(res, alert, null, 200);
    } catch (err) {
      next(err);
    }
  }

  static async markAllRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AlertService.markAllRead(req.user!.id);
      ok(res, result, null, 200);
    } catch (err) {
      next(err);
    }
  }
}
