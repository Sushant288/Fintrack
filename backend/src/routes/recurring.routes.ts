import { Router } from 'express';
import { RecurringController } from '../controllers/recurring.controller';
import { processLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { idParamSchema } from '../validators/common.schema';
import {
  createRecurringRuleSchema,
  listRecurringRulesQuerySchema,
  updateRecurringRuleSchema
} from '../validators/recurring.schema';

const router = Router();

// Manual processing route must be registered BEFORE parameterized :id routes
router.post('/process', processLimiter, RecurringController.processManual);

// Rule collection endpoints
router.post('/', validate({ body: createRecurringRuleSchema }), RecurringController.create);
router.get('/', validate({ query: listRecurringRulesQuerySchema }), RecurringController.list);

// Individual rule lifecycle and mutation endpoints
router.get('/:id', validate({ params: idParamSchema }), RecurringController.getById);
router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateRecurringRuleSchema }),
  RecurringController.update
);
router.delete('/:id', validate({ params: idParamSchema }), RecurringController.delete);
router.post('/:id/pause', validate({ params: idParamSchema }), RecurringController.pause);
router.post('/:id/resume', validate({ params: idParamSchema }), RecurringController.resume);

export default router;
