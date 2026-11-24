import { Router } from 'express';
import { validate } from '../middleware/validate';
import { idParamSchema } from '../validators/common.schema';
import { listAlertsQuerySchema } from '../validators/alert.schema';
import { AlertController } from '../controllers/alert.controller';

const router = Router();

router.get('/unread-count', AlertController.unreadCount);

router.post('/read-all', AlertController.markAllRead);

router.get(
  '/',
  validate({ query: listAlertsQuerySchema }),
  AlertController.list
);

router.patch(
  '/:id/read',
  validate({ params: idParamSchema }),
  AlertController.markRead
);

export default router;
