// M0: Standardized API response
import { Response } from 'express';

export const sendSuccess = <T>(res: Response, data: T, statusCode = 200) => {
  return res.status(statusCode).json({
    status: 'success',
    data
  });
};
