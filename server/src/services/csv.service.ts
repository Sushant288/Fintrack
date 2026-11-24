import { Readable } from 'stream';
import { LIMITS } from '../config/limits';
import { prisma } from '../config/prisma';
import { ExportTransactionsQuery } from '../validators/importExport.schema';
import { formatYmd } from '../utils/dates';
import { formatMoney } from '../utils/money';
import { assertExportSize, toCsvLine } from '../utils/csv';
import { buildTransactionWhere } from './transaction.service';

export class CsvService {
  /**
   * Generates an RFC 4180 compliant CSV export stream of transactions with formula injection protection.
   */
  static async exportTransactions(
    userId: string,
    query: ExportTransactionsQuery
  ): Promise<{
    stream: Readable;
    count: number;
    filename: string;
  }> {
    const where = buildTransactionWhere(userId, query);

    const count = await prisma.transaction.count({ where });
    assertExportSize(count);

    const filename = query.filename || LIMITS.EXPORT.DEFAULT_FILENAME;

    const stream = new Readable({
      read() {}
    });

    // Write CSV Header
    const headerLine = toCsvLine([
      'Date',
      'Type',
      'Category',
      'Amount',
      'Description',
      'Payment Method',
      'Recurring',
      'Created At'
    ]);
    stream.push(headerLine);

    if (count === 0) {
      stream.push(null);
      return { stream, count, filename };
    }

    // Keyset pagination chunk streaming
    (async () => {
      try {
        let skip = 0;
        const chunkSize = LIMITS.EXPORT.CHUNK_SIZE;

        while (skip < count) {
          const rows = await prisma.transaction.findMany({
            where,
            orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
            skip,
            take: chunkSize,
            include: {
              category: {
                select: { name: true }
              }
            }
          });

          if (rows.length === 0) break;

          for (const r of rows) {
            const line = toCsvLine([
              formatYmd(r.date),
              r.type,
              r.category.name,
              formatMoney(r.amount),
              r.description ?? '',
              r.paymentMethod,
              r.recurringId ? 'YES' : 'NO',
              r.createdAt.toISOString()
            ]);
            stream.push(line);
          }

          skip += rows.length;
        }

        stream.push(null);
      } catch (err) {
        stream.destroy(err instanceof Error ? err : new Error(String(err)));
      }
    })();

    return { stream, count, filename };
  }
}
