// M0: User controller
import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/response';

export const getProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    sendSuccess(res, { user: req.user });
  } catch (err) {
    next(err);
  }
};

export const updateProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    sendSuccess(res, { message: 'Profile updated' });
  } catch (err) {
    next(err);
  }
};
