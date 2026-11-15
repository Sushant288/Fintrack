// M0: Mounts all under /api/v1
import { Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import categoryRoutes from './category.routes';
import transactionRoutes from './transaction.routes';
import budgetRoutes from './budget.routes';
import alertRoutes from './alert.routes';
import recurringRoutes from './recurring.routes';
import goalRoutes from './goal.routes';
import analyticsRoutes from './analytics.routes';
import importExportRoutes from './import-export.routes';
import reportRoutes from './report.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/categories', categoryRoutes);
router.use('/transactions', transactionRoutes);
router.use('/budgets', budgetRoutes);
router.use('/alerts', alertRoutes);
router.use('/recurring', recurringRoutes);
router.use('/goals', goalRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/import-export', importExportRoutes);
router.use('/reports', reportRoutes);

export default router;
