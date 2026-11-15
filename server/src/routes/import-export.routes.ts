// M7: Import/Export routes
import { Router } from 'express';
import * as importExportController from '../controllers/import-export.controller';
import { authenticate } from '../middleware/auth';
import { uploadMiddleware } from '../middleware/upload';

const router = Router();

router.use(authenticate);
router.post('/import-csv', uploadMiddleware.single('file'), importExportController.importCSV);
router.get('/export-csv', importExportController.exportCSV);

export default router;
