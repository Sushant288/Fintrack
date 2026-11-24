import { parse } from 'csv-parse/sync';
import { ImportStatus, PaymentMethod, Prisma, TxType } from '@prisma/client';
import { LIMITS } from '../config/limits';
import { prisma } from '../config/prisma';
import {
  ImportConfirmInput,
  ListImportBatchesQuery
} from '../validators/importExport.schema';
import { ApiError, ERROR_CODES } from '../utils/ApiError';
import {
  addDays,
  dateBoundsError,
  formatYmd,
  parseYmd,
  todayInTimeZone
} from '../utils/dates';
import { normalizeDescription } from '../validators/transaction.schema';
import { toCsvLine, unsanitizeCell } from '../utils/csv';
import {
  dedupeHeaders,
  detectDelimiter,
  parseImportAmount,
  parseImportDate,
  parseImportPaymentMethod,
  suggestMapping
} from '../utils/csvImport';
import { loadAlertPrefs } from './alert.service';

export interface ImportPreviewResult {
  fileName: string;
  rowsTotal: number;
  delimiter: string;
  headers: string[];
  suggestedMapping: Record<string, string | null>;
  sampleRows: Record<string, string>[];
}

export class ImportService {
  /**
   * Generates a sample CSV template for users to format transaction uploads.
   */
  static getTemplate(): string {
    const headers = ['Date', 'Type', 'Category', 'Amount', 'Description', 'Payment Method'];
    const rows = [
      ['2026-02-15', 'EXPENSE', 'Groceries', '45.50', 'Weekly grocery shopping', 'CARD'],
      ['2026-02-16', 'INCOME', 'Salary', '3500.00', 'Monthly salary credit', 'BANK_TRANSFER'],
      ['2026-02-18', 'EXPENSE', 'Dining Out', '28.00', 'Dinner at cafe', 'UPI']
    ];
    return toCsvLine(headers) + rows.map((r) => toCsvLine(r)).join('');
  }

  /**
   * Previews an uploaded CSV file without persisting data or creating database records.
   */
  static async previewImport(
    _userId: string,
    fileBuffer: Buffer,
    fileName = 'upload.csv'
  ): Promise<ImportPreviewResult> {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw ApiError.badRequest(ERROR_CODES.IMPORT_FILE_EMPTY, 'Uploaded CSV file is empty');
    }

    const content = fileBuffer.toString('utf-8');
    const firstLine = content.split(/\r?\n/).find((line) => line.trim().length > 0) || '';
    const delimiter = detectDelimiter(firstLine);

    let records: string[][];
    try {
      records = parse(content, {
        delimiter,
        relax_quotes: true,
        skip_empty_lines: true,
        trim: true
      });
    } catch {
      throw ApiError.badRequest(ERROR_CODES.IMPORT_FILE_INVALID, 'Could not parse CSV content');
    }

    if (records.length <= 1) {
      throw ApiError.badRequest(ERROR_CODES.IMPORT_FILE_EMPTY, 'CSV contains no transaction data rows');
    }

    const rawHeaders = records[0];
    const headers = dedupeHeaders(rawHeaders);
    const dataRows = records.slice(1);
    const rowsTotal = dataRows.length;

    if (rowsTotal > LIMITS.IMPORT.MAX_ROWS) {
      throw ApiError.badRequest(
        ERROR_CODES.IMPORT_ROW_LIMIT_EXCEEDED,
        `File contains ${rowsTotal} rows, exceeding the limit of ${LIMITS.IMPORT.MAX_ROWS}`
      );
    }

    const suggestedMapping = suggestMapping(headers);

    const sampleRows: Record<string, string>[] = [];
    const previewCount = Math.min(rowsTotal, LIMITS.IMPORT.PREVIEW_LIMIT);
    for (let i = 0; i < previewCount; i++) {
      const row = dataRows[i];
      const rowObj: Record<string, string> = {};
      headers.forEach((h, colIdx) => {
        rowObj[h] = row[colIdx] ?? '';
      });
      sampleRows.push(rowObj);
    }

    return {
      fileName,
      rowsTotal,
      delimiter,
      headers,
      suggestedMapping,
      sampleRows
    };
  }

  /**
   * Confirms and atomically commits imported CSV rows into the user's transaction ledger.
   */
  static async confirmImport(
    userId: string,
    fileBuffer: Buffer,
    options: ImportConfirmInput,
    fileName = 'import.csv'
  ) {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw ApiError.badRequest(ERROR_CODES.IMPORT_FILE_EMPTY, 'Uploaded CSV file is empty');
    }

    const content = fileBuffer.toString('utf-8');
    const firstLine = content.split(/\r?\n/).find((line) => line.trim().length > 0) || '';
    const delimiter = detectDelimiter(firstLine);

    let records: string[][];
    try {
      records = parse(content, {
        delimiter,
        relax_quotes: true,
        skip_empty_lines: true,
        trim: true
      });
    } catch {
      throw ApiError.badRequest(ERROR_CODES.IMPORT_FILE_INVALID, 'Could not parse CSV content');
    }

    if (records.length <= 1) {
      throw ApiError.badRequest(ERROR_CODES.IMPORT_FILE_EMPTY, 'CSV contains no transaction data rows');
    }

    const rawHeaders = records[0];
    const headers = dedupeHeaders(rawHeaders);
    const dataRows = records.slice(1);
    const rowsTotal = dataRows.length;

    if (rowsTotal > LIMITS.IMPORT.MAX_ROWS) {
      throw ApiError.badRequest(
        ERROR_CODES.IMPORT_ROW_LIMIT_EXCEEDED,
        `File contains ${rowsTotal} rows, exceeding the limit of ${LIMITS.IMPORT.MAX_ROWS}`
      );
    }

    const mapping = options.mapping;
    const dateColIdx = headers.indexOf(mapping.date);
    const amountColIdx = headers.indexOf(mapping.amount);

    if (dateColIdx === -1 || amountColIdx === -1) {
      throw ApiError.badRequest(
        ERROR_CODES.IMPORT_INVALID_MAPPING,
        'Mapped date and amount columns must exist in CSV headers'
      );
    }

    const typeColIdx = mapping.type ? headers.indexOf(mapping.type) : -1;
    const catColIdx = mapping.category ? headers.indexOf(mapping.category) : -1;
    const descColIdx = mapping.description ? headers.indexOf(mapping.description) : -1;
    const payColIdx = mapping.paymentMethod ? headers.indexOf(mapping.paymentMethod) : -1;

    // Load user preferences and category catalog
    const [prefs, userCategories] = await Promise.all([
      loadAlertPrefs(prisma, userId),
      prisma.category.findMany({
        where: { userId },
        select: { id: true, name: true, type: true, isArchived: true }
      })
    ]);

    const todayYmd = todayInTimeZone(prefs.timezone);

    // Build category lookup map: `${lower(name)}|${type}` -> id
    const catLookup = new Map<string, string>();
    for (const c of userCategories) {
      catLookup.set(`${c.name.toLowerCase()}|${c.type}`, c.id);
    }

    // Default category verification
    let defaultCat: { id: string; type: TxType } | null = null;
    if (options.defaultCategoryId) {
      const found = userCategories.find((c) => c.id === options.defaultCategoryId);
      if (!found || found.isArchived) {
        throw ApiError.badRequest(
          ERROR_CODES.CATEGORY_NOT_FOUND,
          'Default category not found or is archived'
        );
      }
      defaultCat = { id: found.id, type: found.type };
    }

    // Query potential duplicate matches in range if deduplication is active
    let duplicateCheckSet = new Set<string>();
    if (options.skipDuplicates) {
      const minDate = addDays(parseYmd(todayYmd), -(LIMITS.TRANSACTION.MAX_PAST_YEARS * 365 + 30));
      const existingTx = await prisma.transaction.findMany({
        where: {
          userId,
          date: { gte: minDate }
        },
        select: {
          date: true,
          amount: true,
          type: true,
          categoryId: true,
          description: true
        }
      });

      for (const t of existingTx) {
        const ymd = formatYmd(t.date);
        const key = `${ymd}|${t.type}|${t.amount.toString()}|${t.categoryId}|${t.description ?? ''}`;
        duplicateCheckSet.add(key);
      }
    }

    // Process and validate rows in-memory
    const toInsert: Array<{
      userId: string;
      categoryId: string;
      type: TxType;
      amount: Prisma.Decimal;
      date: Date;
      description: string | null;
      paymentMethod: PaymentMethod;
    }> = [];

    let rowsSkipped = 0;

    for (const row of dataRows) {
      const rawDate = row[dateColIdx];
      const rawAmount = row[amountColIdx];

      if (!rawDate || !rawAmount) {
        rowsSkipped++;
        continue;
      }

      let parsedDateStr: string;
      try {
        parsedDateStr = parseImportDate(rawDate);
      } catch {
        rowsSkipped++;
        continue;
      }

      const boundsErr = dateBoundsError(parsedDateStr, todayYmd, LIMITS.TRANSACTION.MAX_PAST_YEARS);
      if (boundsErr !== null) {
        rowsSkipped++;
        continue;
      }

      let parsedAmt: { amount: Prisma.Decimal; inferredType?: TxType };
      try {
        parsedAmt = parseImportAmount(rawAmount);
      } catch {
        rowsSkipped++;
        continue;
      }

      // Determine transaction type
      let txType: TxType = options.defaultType ?? TxType.EXPENSE;
      if (parsedAmt.inferredType) {
        txType = parsedAmt.inferredType;
      } else if (typeColIdx !== -1 && row[typeColIdx]) {
        const rawT = row[typeColIdx].trim().toUpperCase();
        if (rawT === 'INCOME' || rawT === 'CREDIT' || rawT === 'CR') {
          txType = TxType.INCOME;
        } else if (rawT === 'EXPENSE' || rawT === 'DEBIT' || rawT === 'DR') {
          txType = TxType.EXPENSE;
        }
      }

      // Determine category
      let categoryId: string | null = null;
      if (catColIdx !== -1 && row[catColIdx]) {
        const rawCatName = row[catColIdx].trim().toLowerCase();
        const matched = catLookup.get(`${rawCatName}|${txType}`);
        if (matched) {
          categoryId = matched;
        }
      }

      if (!categoryId && defaultCat && defaultCat.type === txType) {
        categoryId = defaultCat.id;
      }

      // If no category matched or usable for this type, search any user category of that type
      if (!categoryId) {
        const fallback = userCategories.find((c) => c.type === txType && !c.isArchived);
        if (fallback) {
          categoryId = fallback.id;
        }
      }

      if (!categoryId) {
        rowsSkipped++;
        continue;
      }

      // Parse payment method
      const rawPay = payColIdx !== -1 ? row[payColIdx] : (options.defaultPaymentMethod ?? null);
      const paymentMethod = parseImportPaymentMethod(rawPay);

      // Parse description
      const rawDesc = descColIdx !== -1 ? row[descColIdx] : null;
      const cleanDesc = normalizeDescription(rawDesc ? unsanitizeCell(rawDesc) : null);

      // Deduplication check
      if (options.skipDuplicates) {
        const dedupKey = `${parsedDateStr}|${txType}|${parsedAmt.amount.toString()}|${categoryId}|${cleanDesc ?? ''}`;
        if (duplicateCheckSet.has(dedupKey)) {
          rowsSkipped++;
          continue;
        }
        duplicateCheckSet.add(dedupKey);
      }

      toInsert.push({
        userId,
        categoryId,
        type: txType,
        amount: parsedAmt.amount,
        date: parseYmd(parsedDateStr),
        description: cleanDesc,
        paymentMethod
      });
    }

    if (toInsert.length === 0) {
      throw ApiError.badRequest(
        ERROR_CODES.IMPORT_FILE_INVALID,
        'No valid rows could be parsed from the uploaded file'
      );
    }

    // Atomic execution in Prisma Transaction
    const batch = await prisma.$transaction(
      async (tx) => {
        const createdBatch = await tx.importBatch.create({
          data: {
            userId,
            fileName,
            rowsTotal,
            rowsImported: 0,
            status: ImportStatus.PENDING
          }
        });

        const chunkSize = LIMITS.IMPORT.CHUNK_SIZE;
        for (let i = 0; i < toInsert.length; i += chunkSize) {
          const chunk = toInsert.slice(i, i + chunkSize);
          await tx.transaction.createMany({
            data: chunk.map((c) => ({
              ...c,
              importBatchId: createdBatch.id
            }))
          });
        }

        const updatedBatch = await tx.importBatch.update({
          where: { id: createdBatch.id },
          data: {
            status: ImportStatus.COMPLETED,
            rowsImported: toInsert.length
          }
        });

        return updatedBatch;
      },
      {
        timeout: LIMITS.DB.TRANSACTION_TIMEOUT_MS,
        maxWait: LIMITS.DB.TRANSACTION_MAX_WAIT_MS
      }
    );

    return {
      batchId: batch.id,
      rowsTotal,
      rowsImported: toInsert.length,
      rowsSkipped,
      status: batch.status
    };
  }

  /**
   * Undoes an import batch by deleting all transactions attached to it within the grace window.
   */
  static async undoImport(userId: string, batchId: string) {
    const batch = await prisma.importBatch.findFirst({
      where: { id: batchId, userId }
    });

    if (!batch) {
      throw ApiError.notFound(ERROR_CODES.IMPORT_BATCH_NOT_FOUND, 'Import batch not found');
    }

    if (batch.status === ImportStatus.UNDONE) {
      throw ApiError.badRequest(
        ERROR_CODES.IMPORT_CANNOT_UNDO,
        'Import batch has already been undone'
      );
    }

    const ageDays = (Date.now() - batch.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > LIMITS.IMPORT.UNDO_MAX_AGE_DAYS) {
      throw ApiError.badRequest(
        ERROR_CODES.IMPORT_CANNOT_UNDO,
        `Cannot undo an import older than ${LIMITS.IMPORT.UNDO_MAX_AGE_DAYS} days`
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const deleteResult = await tx.transaction.deleteMany({
        where: {
          importBatchId: batchId,
          userId
        }
      });

      const updated = await tx.importBatch.update({
        where: { id: batchId },
        data: { status: ImportStatus.UNDONE }
      });

      return { rowsDeleted: deleteResult.count, status: updated.status };
    });

    return {
      batchId,
      rowsDeleted: result.rowsDeleted,
      status: result.status
    };
  }

  /**
   * Lists past import batches for the user with pagination.
   */
  static async listBatches(userId: string, query: ListImportBatchesQuery) {
    const page = query.page;
    const limit = query.limit;

    const [items, total] = await Promise.all([
      prisma.importBatch.findMany({
        where: { userId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.importBatch.count({ where: { userId } })
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}
