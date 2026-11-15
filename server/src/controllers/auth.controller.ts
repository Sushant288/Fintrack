// M0: Auth controller
import { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service';
import { sendSuccess } from '../utils/response';

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.register(req.body);
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.login(req.body);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};

export const refreshToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.refreshToken(req.body.refreshToken);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
};
