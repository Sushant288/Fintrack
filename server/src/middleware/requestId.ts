// M0: Request ID middleware
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export const requestId = (req: Request, res: Response, next: NextFunction) => {
  const reqId = (req.headers['x-request-id'] as string) || randomUUID();
  req.headers['x-request-id'] = reqId;
  res.setHeader('X-Request-Id', reqId);
  next();
};
