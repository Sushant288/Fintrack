import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const elapsedNs = process.hrtime.bigint() - start;
    const durationMs = Number(elapsedNs) / 1_000_000;
    const pathWithoutQuery = (req.originalUrl || req.url || '').split('?')[0];

    logger.info('HTTP request completed', {
      method: req.method,
      path: pathWithoutQuery,
      status: res.statusCode,
      durationMs: parseFloat(durationMs.toFixed(2)),
      ...(req.user?.id ? { userId: req.user.id } : {})
    }, req.requestId);
  });

  next();
}
