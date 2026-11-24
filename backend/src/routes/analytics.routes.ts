import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { heavyLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import {
  budgetVsActualQuerySchema,
  categoryBreakdownQuerySchema,
  summaryQuerySchema,
  trendQuerySchema
} from '../validators/analytics.schema';
import { AnalyticsController } from '../controllers/analytics.controller';

const router = Router();

router.use(requireAuth);
router.use(heavyLimiter);

router.get('/summary', validate({ query: summaryQuerySchema }), AnalyticsController.getSummary);
router.get(
  '/categories',
  validate({ query: categoryBreakdownQuerySchema }),
  AnalyticsController.getCategoryBreakdown
);
router.get('/trend', validate({ query: trendQuerySchema }), AnalyticsController.getTrend);
router.get(
  '/budgets',
  validate({ query: budgetVsActualQuerySchema }),
  AnalyticsController.getBudgetVsActual
);

export default router;
