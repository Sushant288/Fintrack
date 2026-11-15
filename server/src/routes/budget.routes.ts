// M3: Budget routes
import { Router } from 'express';
import * as budgetController from '../controllers/budget.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { budgetSchema } from '../validators/budget.schema';

const router = Router();

router.use(authenticate);
router.get('/', budgetController.getBudgets);
router.post('/', validate(budgetSchema), budgetController.createBudget);
router.put('/:id', validate(budgetSchema), budgetController.updateBudget);
router.delete('/:id', budgetController.deleteBudget);

export default router;
