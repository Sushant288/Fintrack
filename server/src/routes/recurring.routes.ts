// M4: Recurring routes
import { Router } from 'express';
import * as recurringController from '../controllers/recurring.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { recurringSchema } from '../validators/recurring.schema';

const router = Router();

router.use(authenticate);
router.get('/', recurringController.getRecurringTransactions);
router.post('/', validate(recurringSchema), recurringController.createRecurringTransaction);
router.put('/:id', validate(recurringSchema), recurringController.updateRecurringTransaction);
router.delete('/:id', recurringController.deleteRecurringTransaction);

export default router;
