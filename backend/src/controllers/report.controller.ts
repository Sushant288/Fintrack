import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { ReportService } from '../services/report.service';
import { ApiError, ERROR_CODES } from '../utils/ApiError';
import { ok } from '../utils/response';
import { setDownloadHeaders } from '../utils/download';
import { getValidated } from '../middleware/validate';
import {
  RegenerateReportInput,
  ReportListQuery,
  ReportQuery
} from '../validators/report.schema';

export class ReportController {
  static async listReports(req: Request, res: Response) {
    const query = getValidated<any, ReportListQuery>(req).query;
    const data = await ReportService.listReports(req.user!.id, query.limit);
    return ok(res, data.items);
  }

  static async getReport(req: Request, res: Response) {
    const query = getValidated<any, ReportQuery>(req).query;
    const data = await ReportService.getReport(req.user!.id, query.year, query.month);
    return ok(res, data);
  }

  static async regenerateReport(req: Request, res: Response) {
    const body = getValidated<RegenerateReportInput>(req).body;
    const data = await ReportService.regenerateReport(req.user!.id, body.year, body.month);
    return ok(res, data);
  }

  static async getReportPdf(req: Request, res: Response) {
    const query = getValidated<any, ReportQuery>(req).query;
    const buffer = await ReportService.getReportPdf(req.user!.id, query.year, query.month);

    const padM = String(query.month).padStart(2, '0');
    setDownloadHeaders(res, {
      filename: `fintrack-report-${query.year}-${padM}.pdf`,
      contentType: 'application/pdf'
    });

    return res.status(200).send(buffer);
  }

  static async getReportPdfById(req: Request, res: Response) {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const record = await prisma.report.findFirst({
      where: { id, userId: req.user!.id }
    });

    if (!record) {
      throw ApiError.notFound(ERROR_CODES.REPORT_NOT_FOUND, 'Report not found');
    }

    const buffer = await ReportService.getReportPdf(req.user!.id, record.year, record.month);
    const padM = String(record.month).padStart(2, '0');
    setDownloadHeaders(res, {
      filename: `fintrack-report-${record.year}-${padM}.pdf`,
      contentType: 'application/pdf'
    });

    return res.status(200).send(buffer);
  }

  static async getReportCsv(req: Request, res: Response) {
    const query = getValidated<any, ReportQuery>(req).query;
    const csv = await ReportService.getReportCsv(req.user!.id, query.year, query.month);

    const padM = String(query.month).padStart(2, '0');
    setDownloadHeaders(res, {
      filename: `fintrack-report-${query.year}-${padM}.csv`,
      contentType: 'text/csv; charset=utf-8'
    });

    return res.status(200).send(csv);
  }
}
