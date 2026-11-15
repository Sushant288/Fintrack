// M3: Alert routes
import { Router } from 'express';
import * as alertController from '../controllers/alert.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.get('/', alertController.getAlerts);
router.patch('/:id/read', alertController.markAsRead);

export default router;
