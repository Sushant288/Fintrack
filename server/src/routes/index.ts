import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { requireAuth } from '../middleware/auth';
import { ok } from '../utils/response';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import categoryRoutes from './category.routes';
import transactionRoutes from './transaction.routes';
import budgetRoutes from './budget.routes';
import alertRoutes from './alert.routes';

const router = Router();

// Health check endpoints
router.get('/health', (_req: Request, res: Response) => {
  return ok(res, { status: 'ok' }, null, 200);
});

router.get('/health/ready', async (_req: Request, res: Response) => {
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

// Domain route modules
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/categories', categoryRoutes);
router.use('/transactions', requireAuth, transactionRoutes);
router.use('/budgets', requireAuth, budgetRoutes);
router.use('/alerts', requireAuth, alertRoutes);

export default router;
