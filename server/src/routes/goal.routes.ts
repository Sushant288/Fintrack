// M5: Goal routes
import { Router } from 'express';
import * as goalController from '../controllers/goal.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { goalSchema } from '../validators/goal.schema';

const router = Router();

router.use(authenticate);
router.get('/', goalController.getGoals);
router.post('/', validate(goalSchema), goalController.createGoal);
router.put('/:id', validate(goalSchema), goalController.updateGoal);
router.delete('/:id', goalController.deleteGoal);

export default router;
