import { Router } from 'express';
import { validate } from '../middleware/validate';
import { idParamSchema } from '../validators/common.schema';
import {
  copyBudgetSchema,
  deleteOverallBudgetQuerySchema,
  upsertBudgetSchema,
  upsertOverallBudgetSchema,
  viewBudgetQuerySchema
} from '../validators/budget.schema';
import { BudgetController } from '../controllers/budget.controller';

const router = Router();

// /overall and /copy must be registered before /:id routes
router.put(
  '/overall',
  validate({ body: upsertOverallBudgetSchema }),
  BudgetController.upsertOverall
);

router.delete(
  '/overall',
  validate({ query: deleteOverallBudgetQuerySchema }),
  BudgetController.deleteOverall
);

router.post(
  '/copy',
  validate({ body: copyBudgetSchema }),
  BudgetController.copy
);

router.get(
  '/',
  validate({ query: viewBudgetQuerySchema }),
  BudgetController.view
);

router.put(
  '/',
  validate({ body: upsertBudgetSchema }),
  BudgetController.upsert
);

router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  BudgetController.deleteBudget
);

export default router;
