// M2: Transaction controller
import { Request, Response, NextFunction } from 'express';
import * as transactionService from '../services/transaction.service';
import { sendSuccess } from '../utils/response';

export const getTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const transactions = await transactionService.getAll(req.user!.id);
    sendSuccess(res, transactions);
  } catch (err) {
    next(err);
  }
};

export const getTransactionById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const transaction = await transactionService.getById(req.user!.id, req.params.id);
    sendSuccess(res, transaction);
  } catch (err) {
    next(err);
  }
};

export const createTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const transaction = await transactionService.create(req.user!.id, req.body);
    sendSuccess(res, transaction, 201);
  } catch (err) {
    next(err);
  }
};

export const updateTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const transaction = await transactionService.update(req.user!.id, req.params.id, req.body);
    sendSuccess(res, transaction);
  } catch (err) {
    next(err);
  }
};

export const deleteTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await transactionService.remove(req.user!.id, req.params.id);
    sendSuccess(res, { message: 'Transaction deleted' });
  } catch (err) {
    next(err);
  }
};
