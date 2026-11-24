import { Request, Response } from 'express';
import { CsvService } from '../services/csv.service';
import { ImportService } from '../services/import.service';
import { ApiError, ERROR_CODES } from '../utils/ApiError';
import { ok } from '../utils/response';
import { getValidated } from '../middleware/validate';
import { setDownloadHeaders } from '../utils/download';
import {
  ExportTransactionsQuery,
  importConfirmSchema,
  ListImportBatchesQuery
} from '../validators/importExport.schema';

export class ImportExportController {
  static async exportTransactions(req: Request, res: Response) {
    const query = getValidated<any, ExportTransactionsQuery>(req).query;
    const { stream, filename } = await CsvService.exportTransactions(req.user!.id, query);

    setDownloadHeaders(res, {
      filename,
      contentType: 'text/csv; charset=utf-8'
    });

    stream.pipe(res);
  }

  static async getTemplate(_req: Request, res: Response) {
    const template = ImportService.getTemplate();
    setDownloadHeaders(res, {
      filename: 'transactions-template.csv',
      contentType: 'text/csv; charset=utf-8'
    });
    return res.status(200).send(template);
  }

  static async previewImport(req: Request, res: Response) {
    if (!req.file) {
      throw ApiError.badRequest(ERROR_CODES.IMPORT_FILE_REQUIRED, 'CSV file is required');
    }

    const data = await ImportService.previewImport(
      req.user!.id,
      req.file.buffer,
      req.file.originalname
    );

    return ok(res, data);
  }

  static async confirmImport(req: Request, res: Response) {
    if (!req.file) {
      throw ApiError.badRequest(ERROR_CODES.IMPORT_FILE_REQUIRED, 'CSV file is required');
    }

    let rawBody = req.body ?? {};
    let mapping = rawBody.mapping;
    if (typeof mapping === 'string') {
      try {
        mapping = JSON.parse(mapping);
      } catch {
        throw ApiError.badRequest(
          ERROR_CODES.IMPORT_INVALID_MAPPING,
          'mapping field must be valid JSON object'
        );
      }
    }

    const parsedOptions = importConfirmSchema.parse({
      ...rawBody,
      mapping
    });

    const data = await ImportService.confirmImport(
      req.user!.id,
      req.file.buffer,
      parsedOptions,
      req.file.originalname
    );

    return ok(res, data, null, 201);
  }

  static async undoImport(req: Request, res: Response) {
    const rawBatchId = req.params.batchId;
    const batchId = Array.isArray(rawBatchId) ? rawBatchId[0] : rawBatchId;
    if (!batchId) {
      throw ApiError.badRequest(ERROR_CODES.VALIDATION_ERROR, 'batchId is required');
    }

    const data = await ImportService.undoImport(req.user!.id, batchId);
    return ok(res, data);
  }

  static async listBatches(req: Request, res: Response) {
    const query = getValidated<any, ListImportBatchesQuery>(req).query;
    const data = await ImportService.listBatches(req.user!.id, query);
    return ok(res, data.items, data.meta);
  }
}
