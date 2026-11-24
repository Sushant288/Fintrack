import { Router } from 'express';
import { GoalController } from '../controllers/goal.controller';
import { validate } from '../middleware/validate';
import { idParamSchema } from '../validators/common.schema';
import {
  contributeGoalSchema,
  createGoalSchema,
  listContributionsQuerySchema,
  listGoalsQuerySchema,
  updateGoalSchema
} from '../validators/goal.schema';

const router = Router();

// Goal collection endpoints
router.post('/', validate({ body: createGoalSchema }), GoalController.create);
router.get('/', validate({ query: listGoalsQuerySchema }), GoalController.list);

// Goal contributions
router.post(
  '/:id/contributions',
  validate({ params: idParamSchema, body: contributeGoalSchema }),
  GoalController.contribute
);
router.get(
  '/:id/contributions',
  validate({ params: idParamSchema, query: listContributionsQuerySchema }),
  GoalController.listContributions
);

// Individual goal lifecycle and mutation endpoints
router.get('/:id', validate({ params: idParamSchema }), GoalController.getById);
router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateGoalSchema }),
  GoalController.update
);
router.delete('/:id', validate({ params: idParamSchema }), GoalController.delete);
router.post('/:id/archive', validate({ params: idParamSchema }), GoalController.archive);
router.post('/:id/unarchive', validate({ params: idParamSchema }), GoalController.unarchive);

export default router;
