// M2: Transaction routes
import { Router } from 'express';
import * as transactionController from '../controllers/transaction.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { transactionSchema } from '../validators/transaction.schema';

const router = Router();

router.use(authenticate);
router.get('/', transactionController.getTransactions);
router.post('/', validate(transactionSchema), transactionController.createTransaction);
router.get('/:id', transactionController.getTransactionById);
router.put('/:id', validate(transactionSchema), transactionController.updateTransaction);
router.delete('/:id', transactionController.deleteTransaction);

export default router;
