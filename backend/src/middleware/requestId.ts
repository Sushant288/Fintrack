import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const id = incoming && incoming.trim().length > 0 ? incoming.trim() : crypto.randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
