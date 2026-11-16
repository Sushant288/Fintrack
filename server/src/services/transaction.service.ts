import { PaymentMethod, Prisma, TxType } from '@prisma/client';
import { LIMITS } from '../config/limits';
import { prisma } from '../config/prisma';
import {
  CreateTransactionInput,
  ListTransactionsQuery,
  UpdateTransactionInput
} from '../validators/transaction.schema';
import { ApiError, ERROR_CODES } from '../utils/ApiError';
import { formatYmd, parseYmd, subtractYears, todayInTimeZone } from '../utils/dates';
import { formatMoney, parseMoney } from '../utils/money';
import { AlertDto, evaluateBudgetsForSpend, loadAlertPrefs } from './alert.service';
import { assertCategoryUsable } from './category.service';

export interface TransactionDto {
  id: string;
  type: TxType;
  amount: string;
  date: string;
  description: string | null;
  paymentMethod: PaymentMethod;
  category: {
    id: string;
    name: string;
    type: TxType;
    color: string;
    icon: string;
    isArchived: boolean;
  };
  recurringId: string | null;
  importBatchId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toTransactionDto(row: any): TransactionDto {
  return {
    id: row.id,
    type: row.type,
    amount: formatMoney(row.amount),
    date: formatYmd(row.date),
    description: row.description,
    paymentMethod: row.paymentMethod,
    category: {
      id: row.category.id,
      name: row.category.name,
      type: row.category.type,
      color: row.category.color,
      icon: row.category.icon,
      isArchived: row.category.isArchived
    },
    recurringId: row.recurringId ?? null,
    importBatchId: row.importBatchId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

/**
 * Validates transaction dates against the user's timezone bounds.
 */
async function assertValidTransactionDate(
  client: Prisma.TransactionClient | typeof prisma,
  userId: string,
  dateYmd: string
): Promise<void> {
  const prefs = await loadAlertPrefs(client, userId);
  const today = todayInTimeZone(prefs.timezone);
  const oldestAllowed = subtractYears(today, LIMITS.TRANSACTION.MAX_PAST_YEARS);

  if (dateYmd > today) {
    throw ApiError.badRequest(ERROR_CODES.DATE_IN_FUTURE, 'Transaction date cannot be in the future');
  }

  if (dateYmd < oldestAllowed) {
    throw ApiError.badRequest(
      ERROR_CODES.DATE_TOO_OLD,
      `Transaction date cannot be older than ${LIMITS.TRANSACTION.MAX_PAST_YEARS} years`
    );
  }
}

/**
 * Exported transaction insertion primitive for composition within B2, B3 (recurring), and B4 (import).
 */
export async function createTransactionInTx(
  tx: Prisma.TransactionClient,
  userId: string,
  input: CreateTransactionInput,
  source?: { recurringId?: string; importBatchId?: string },
  opts?: { skipAlertEvaluation?: boolean }
): Promise<{ transaction: TransactionDto; alerts: AlertDto[] }> {
  // 1. Validate date rules unless relaxed by an automated source
  if (!source) {
    await assertValidTransactionDate(tx, userId, input.date);
  } else {
    // Automated sources still cannot insert older than max past years
    const prefs = await loadAlertPrefs(tx, userId);
    const today = todayInTimeZone(prefs.timezone);
    const oldestAllowed = subtractYears(today, LIMITS.TRANSACTION.MAX_PAST_YEARS);
    if (input.date < oldestAllowed) {
      throw ApiError.badRequest(ERROR_CODES.DATE_TOO_OLD);
    }
  }

  // 2. Validate category usability for this type
  await assertCategoryUsable(tx, userId, input.categoryId, input.type);

  // 3. Insert transaction
  let created: any;
  try {
    created = await tx.transaction.create({
      data: {
        userId,
        categoryId: input.categoryId,
        type: input.type,
        amount: parseMoney(input.amount),
        date: parseYmd(input.date),
        description: input.description ?? null,
        paymentMethod: input.paymentMethod ?? PaymentMethod.OTHER,
        recurringId: source?.recurringId ?? null,
        importBatchId: source?.importBatchId ?? null
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            icon: true,
            isArchived: true
          }
        }
      }
    });
  } catch (err: any) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw ApiError.conflict(
        ERROR_CODES.CONFLICT,
        'A transaction for this recurring schedule and date already exists'
      );
    }
    throw err;
  }

  // 4. Evaluate budget alerts for EXPENSE transactions
  let alerts: AlertDto[] = [];
  if (input.type === 'EXPENSE' && !opts?.skipAlertEvaluation) {
    alerts = await evaluateBudgetsForSpend(tx, userId, [
      { categoryId: input.categoryId, date: parseYmd(input.date) }
    ]);
  }

  return { transaction: toTransactionDto(created), alerts };
}

export class TransactionService {
  static async create(
    userId: string,
    input: CreateTransactionInput
  ): Promise<{ transaction: TransactionDto; alerts: AlertDto[] }> {
    return prisma.$transaction(
      async (tx) => createTransactionInTx(tx, userId, input),
      {
        timeout: LIMITS.DB.TRANSACTION_TIMEOUT_MS,
        maxWait: LIMITS.DB.TRANSACTION_MAX_WAIT_MS
      }
    );
  }

  static async update(
    userId: string,
    id: string,
    input: UpdateTransactionInput
  ): Promise<{ transaction: TransactionDto; alerts: AlertDto[] }> {
    return prisma.$transaction(
      async (tx) => {
        // 1. Scoped lookup
        const existing = await tx.transaction.findFirst({
          where: { id, userId },
          include: { category: true }
        });

        if (!existing) {
          throw ApiError.notFound(ERROR_CODES.TRANSACTION_NOT_FOUND, 'Transaction not found');
        }

        const finalType = input.type ?? existing.type;
        const finalCategoryId = input.categoryId ?? existing.categoryId;
        const finalDateYmd = input.date ?? formatYmd(existing.date);

        // 2. Validate category changes
        if (input.categoryId !== undefined || input.type !== undefined) {
          if (input.categoryId !== undefined || finalType !== existing.type) {
            await assertCategoryUsable(tx, userId, finalCategoryId, finalType);
          }
        }

        // 3. Validate date changes
        if (input.date !== undefined && input.date !== formatYmd(existing.date)) {
          await assertValidTransactionDate(tx, userId, input.date);
        }

        // 4. Update transaction
        await tx.transaction.updateMany({
          where: { id, userId },
          data: {
            ...(input.type !== undefined ? { type: input.type } : {}),
            ...(input.amount !== undefined ? { amount: parseMoney(input.amount) } : {}),
            ...(input.date !== undefined ? { date: parseYmd(input.date) } : {}),
            ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.paymentMethod !== undefined ? { paymentMethod: input.paymentMethod } : {})
          }
        });

        const updated = await tx.transaction.findFirst({
          where: { id, userId },
          include: {
            category: {
              select: {
                id: true,
                name: true,
                type: true,
                color: true,
                icon: true,
                isArchived: true
              }
            }
          }
        });

        // 5. Evaluate alerts for final expense state
        let alerts: AlertDto[] = [];
        if (finalType === 'EXPENSE') {
          alerts = await evaluateBudgetsForSpend(tx, userId, [
            { categoryId: finalCategoryId, date: parseYmd(finalDateYmd) }
          ]);
        }

        return { transaction: toTransactionDto(updated!), alerts };
      },
      {
        timeout: LIMITS.DB.TRANSACTION_TIMEOUT_MS,
        maxWait: LIMITS.DB.TRANSACTION_MAX_WAIT_MS
      }
    );
  }

  static async getById(userId: string, id: string): Promise<TransactionDto> {
    const row = await prisma.transaction.findFirst({
      where: { id, userId },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            icon: true,
            isArchived: true
          }
        }
      }
    });

    if (!row) {
      throw ApiError.notFound(ERROR_CODES.TRANSACTION_NOT_FOUND, 'Transaction not found');
    }

    return toTransactionDto(row);
  }

  static async list(
    userId: string,
    query: ListTransactionsQuery
  ): Promise<{
    items: TransactionDto[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      totals: { income: string; expense: string; net: string };
    };
  }> {
    const where: Prisma.TransactionWhereInput = {
      userId,
      ...(query.from || query.to
        ? {
            date: {
              gte: query.from ? parseYmd(query.from) : undefined,
              lte: query.to ? parseYmd(query.to) : undefined
            }
          }
        : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
      ...(query.recurringId ? { recurringId: query.recurringId } : {}),
      ...(query.minAmount || query.maxAmount
        ? {
            amount: {
              gte: query.minAmount ? parseMoney(query.minAmount) : undefined,
              lte: query.maxAmount ? parseMoney(query.maxAmount) : undefined
            }
          }
        : {}),
      ...(query.q
        ? {
            description: {
              contains: query.q.replace(/[%_\\]/g, '\\$&'),
              mode: 'insensitive'
            }
          }
        : {})
    };

    const orderBy: Prisma.TransactionOrderByWithRelationInput[] = [
      { [query.sort.field]: query.sort.dir },
      { createdAt: 'desc' },
      { id: 'desc' }
    ];

    const [rows, total, sums] = await Promise.all([
      prisma.transaction.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy,
        include: {
          category: {
            select: {
              id: true,
              name: true,
              type: true,
              color: true,
              icon: true,
              isArchived: true
            }
          }
        }
      }),
      prisma.transaction.count({ where }),
      prisma.transaction.groupBy({
        by: ['type'],
        _sum: { amount: true },
        where
      })
    ]);

    let income = new Prisma.Decimal(0);
    let expense = new Prisma.Decimal(0);
    for (const s of sums) {
      if (s.type === 'INCOME' && s._sum.amount) {
        income = s._sum.amount;
      }
      if (s.type === 'EXPENSE' && s._sum.amount) {
        expense = s._sum.amount;
      }
    }
    const net = income.sub(expense);
    const totalPages = Math.ceil(total / query.limit) || 1;

    return {
      items: rows.map(toTransactionDto),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
        totals: {
          income: formatMoney(income),
          expense: formatMoney(expense),
          net: formatMoney(net)
        }
      }
    };
  }

  static async remove(userId: string, id: string): Promise<{ deleted: true }> {
    const res = await prisma.transaction.deleteMany({
      where: { id, userId }
    });

    if (res.count === 0) {
      throw ApiError.notFound(ERROR_CODES.TRANSACTION_NOT_FOUND, 'Transaction not found');
    }

    return { deleted: true };
  }

  static async bulkRemove(userId: string, ids: string[]): Promise<{ deleted: number }> {
    const res = await prisma.transaction.deleteMany({
      where: {
        userId,
        id: { in: ids }
      }
    });

    return { deleted: res.count };
  }
}
