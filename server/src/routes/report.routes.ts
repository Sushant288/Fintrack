// M8: Report routes
import { Router } from 'express';
import * as reportController from '../controllers/report.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.get('/monthly', reportController.getMonthlyReport);

export default router;
