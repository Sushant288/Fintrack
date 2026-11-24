import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { heavyLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import {
  regenerateReportSchema,
  reportListQuerySchema,
  reportQuerySchema
} from '../validators/report.schema';
import { ReportController } from '../controllers/report.controller';

const router = Router();

router.use(requireAuth);
router.use(heavyLimiter);

// Specific routes before param routes
router.get('/months', validate({ query: reportListQuerySchema }), ReportController.listReports);
router.get('/pdf', validate({ query: reportQuerySchema }), ReportController.getReportPdf);
router.get('/csv', validate({ query: reportQuerySchema }), ReportController.getReportCsv);
router.post(
  '/regenerate',
  validate({ body: regenerateReportSchema }),
  ReportController.regenerateReport
);

// General GET: if year & month in query, returns report; otherwise lists months
router.get('/', (req, res, next) => {
  if (req.query.year && req.query.month) {
    return validate({ query: reportQuerySchema })(req, res, () =>
      ReportController.getReport(req, res)
    );
  }
  return validate({ query: reportListQuerySchema })(req, res, () =>
    ReportController.listReports(req, res)
  );
});

// PDF download by Report ID
router.get('/:id/pdf', ReportController.getReportPdfById);

export default router;
