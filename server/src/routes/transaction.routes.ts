import { Router } from 'express';
import { validate } from '../middleware/validate';
import { idParamSchema } from '../validators/common.schema';
import {
  bulkDeleteTransactionsSchema,
  createTransactionSchema,
  listTransactionsQuerySchema,
  updateTransactionSchema
} from '../validators/transaction.schema';
import { TransactionController } from '../controllers/transaction.controller';

const router = Router();

router.post(
  '/',
  validate({ body: createTransactionSchema }),
  TransactionController.create
);

router.get(
  '/',
  validate({ query: listTransactionsQuerySchema }),
  TransactionController.list
);

// Must be registered before /:id to prevent matching "bulk-delete" as a UUID param
router.post(
  '/bulk-delete',
  validate({ body: bulkDeleteTransactionsSchema }),
  TransactionController.bulkRemove
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  TransactionController.getById
);

router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateTransactionSchema }),
  TransactionController.update
);

router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  TransactionController.remove
);

export default router;
