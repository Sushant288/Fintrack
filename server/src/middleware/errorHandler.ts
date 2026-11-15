// M0: Global error handling middleware
import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error(err);

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      status: 'error',
      statusCode: err.statusCode,
      message: err.message
    });
  }

  return res.status(500).json({
    status: 'error',
    statusCode: 500,
    message: 'Internal Server Error'
  });
};
