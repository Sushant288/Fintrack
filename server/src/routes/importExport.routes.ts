import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { heavyLimiter, importLimiter } from '../middleware/rateLimit';
import { upload } from '../middleware/upload';
import { validate } from '../middleware/validate';
import {
  exportTransactionsQuerySchema,
  listImportBatchesQuerySchema
} from '../validators/importExport.schema';
import { ImportExportController } from '../controllers/importExport.controller';

const router = Router();

// 1. Transactions CSV export (GET /transactions/export)
router.get(
  '/export',
  requireAuth,
  heavyLimiter,
  validate({ query: exportTransactionsQuerySchema }),
  ImportExportController.exportTransactions
);

// 2. CSV Import Template download (GET /transactions/import/template)
router.get('/import/template', requireAuth, ImportExportController.getTemplate);

// 3. Stateless preview import (POST /transactions/import/preview)
router.post(
  '/import/preview',
  requireAuth,
  importLimiter,
  upload.single('file'),
  ImportExportController.previewImport
);

// 4. Confirm import batch (POST /transactions/import/confirm)
router.post(
  '/import/confirm',
  requireAuth,
  importLimiter,
  upload.single('file'),
  ImportExportController.confirmImport
);

// 5. List past import batches (GET /transactions/import/batches)
router.get(
  '/import/batches',
  requireAuth,
  validate({ query: listImportBatchesQuerySchema }),
  ImportExportController.listBatches
);

// 6. Undo import batch (DELETE /transactions/import/batches/:batchId or POST /transactions/import/batches/:batchId/undo)
router.delete('/import/batches/:batchId', requireAuth, ImportExportController.undoImport);
router.post('/import/batches/:batchId/undo', requireAuth, ImportExportController.undoImport);

export default router;
