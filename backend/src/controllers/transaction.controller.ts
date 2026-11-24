import { NextFunction, Request, Response } from 'express';
import { getValidated } from '../middleware/validate';
import {
  BulkDeleteTransactionsInput,
  CreateTransactionInput,
  ListTransactionsQuery,
  UpdateTransactionInput
} from '../validators/transaction.schema';
import { ok } from '../utils/response';
import { TransactionService } from '../services/transaction.service';

export class TransactionController {
  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { body } = getValidated<CreateTransactionInput>(req);
      const { transaction, alerts } = await TransactionService.create(req.user!.id, body);
      ok(res, transaction, { alerts }, 201);
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { query } = getValidated<unknown, ListTransactionsQuery>(req);
      const { items, meta } = await TransactionService.list(req.user!.id, query);
      ok(res, items, meta, 200);
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { params } = getValidated<unknown, unknown, { id: string }>(req);
      const transaction = await TransactionService.getById(req.user!.id, params.id);
      ok(res, transaction, null, 200);
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { params, body } = getValidated<UpdateTransactionInput, unknown, { id: string }>(req);
      const { transaction, alerts } = await TransactionService.update(
        req.user!.id,
        params.id,
        body
      );
      ok(res, transaction, { alerts }, 200);
    } catch (err) {
      next(err);
    }
  }

  static async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { params } = getValidated<unknown, unknown, { id: string }>(req);
      const result = await TransactionService.remove(req.user!.id, params.id);
      ok(res, result, null, 200);
    } catch (err) {
      next(err);
    }
  }

  static async bulkRemove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { body } = getValidated<BulkDeleteTransactionsInput>(req);
      const result = await TransactionService.bulkRemove(req.user!.id, body.ids);
      ok(res, result, null, 200);
    } catch (err) {
      next(err);
    }
  }
}
