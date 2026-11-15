// M5: Goal controller
import { Request, Response, NextFunction } from 'express';
import * as goalService from '../services/goal.service';
import { sendSuccess } from '../utils/response';

export const getGoals = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const goals = await goalService.getAll(req.user!.id);
    sendSuccess(res, goals);
  } catch (err) {
    next(err);
  }
};

export const createGoal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const goal = await goalService.create(req.user!.id, req.body);
    sendSuccess(res, goal, 201);
  } catch (err) {
    next(err);
  }
};

export const updateGoal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const goal = await goalService.update(req.user!.id, req.params.id, req.body);
    sendSuccess(res, goal);
  } catch (err) {
    next(err);
  }
};

export const deleteGoal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await goalService.remove(req.user!.id, req.params.id);
    sendSuccess(res, { message: 'Goal deleted' });
  } catch (err) {
    next(err);
  }
};
