import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { prisma } from './config/prisma';
import routes from './routes';
import { requestId } from './middleware/requestId';
import { requestLogger } from './middleware/requestLogger';
import { generalLimiter } from './middleware/rateLimit';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';
import { ok } from './utils/response';

const app: Application = express();

// 1. Trust proxy configuration
app.set('trust proxy', env.TRUST_PROXY);

// 2. Request identifier
app.use(requestId);

// 3. Structured request logger
app.use(requestLogger);

// 4. Helmet security headers
app.use(helmet());

// 5. CORS policy with origin allow-list
app.use(
  cors({
    origin: (requestOrigin, callback) => {
      // Requests without Origin header (like non-browser clients, mobile apps, or curl) are permitted
      if (!requestOrigin) {
        return callback(null, true);
      }
      try {
        const normalized = new URL(requestOrigin).origin;
        if (env.CLIENT_ORIGINS.includes(normalized)) {
          return callback(null, true);
        }
      } catch {
        // Disallowed origin format
      }
      return callback(null, false);
    },
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type'],
    exposedHeaders: ['X-Request-Id', 'Retry-After', 'Content-Disposition'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
  })
);

// 6. JSON body parser with 1MB ceiling
app.use(express.json({ limit: '1mb' }));

// 7. Cookie parser
app.use(cookieParser());

// 8. General rate limiter
app.use(generalLimiter);

// Cache-Control: no-store for all API routes
app.use('/api', (_req: Request, res: Response, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Direct root health probes
app.get('/health', (_req: Request, res: Response) => {
  return ok(res, { status: 'ok' }, null, 200);
});

app.get('/health/ready', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return ok(res, { status: 'ok', db: 'up' }, null, 200);
  } catch {
    return res.status(503).json({
      data: null,
      meta: null,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Database connectivity probe failed'
      }
    });
  }
});

// 9. Mount API routes under /api/v1
app.use('/api/v1', routes);

// 10. Route not found fallback
app.use(notFoundHandler);

// 11. Central error handler
app.use(errorHandler);

export default app;
