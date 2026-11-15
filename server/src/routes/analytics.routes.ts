// M6: Analytics routes
import { Router } from 'express';
import * as analyticsController from '../controllers/analytics.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.get('/overview', analyticsController.getOverview);
router.get('/spending-by-category', analyticsController.getSpendingByCategory);
router.get('/income-vs-expense', analyticsController.getIncomeVsExpense);

export default router;
