import { Prisma } from '@prisma/client';
import { LIMITS } from '../config/limits';
import { prisma } from '../config/prisma';
import { ListAlertsQuery } from '../validators/alert.schema';
import { ApiError, ERROR_CODES } from '../utils/ApiError';
import { monthLabel, monthRange } from '../utils/dates';
import { formatMoney, reachedThreshold } from '../utils/money';

export interface AlertDto {
  id: string;
  budgetId: string;
  categoryId: string;
  categoryName: string;
  threshold: number;
  month: number;
  year: number;
  message: string;
  isRead: boolean;
  createdAt: Date;
}

export interface AlertPrefs {
  thresholds: number[];
  inAppEnabled: boolean;
  currency: string;
  timezone: string;
}

/**
 * Loads alert preferences from the User table, ensuring thresholds are sorted ascending.
 */
export async function loadAlertPrefs(
  client: Prisma.TransactionClient | typeof prisma,
  userId: string
): Promise<AlertPrefs> {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: {
      alertThresholds: true,
      alertInAppEnabled: true,
      currency: true,
      timezone: true
    }
  });

  if (!user) {
    throw ApiError.notFound(ERROR_CODES.NOT_FOUND, 'User not found');
  }

  const sortedThresholds = [...user.alertThresholds].sort((a, b) => a - b);
  return {
    thresholds: sortedThresholds,
    inAppEnabled: user.alertInAppEnabled,
    currency: user.currency,
    timezone: user.timezone
  };
}

/**
 * Formats an alert notification message.
 * Uses exact decimal strings with Intl.NumberFormat to prevent precision loss.
 */
export function buildAlertMessage(params: {
  threshold: number;
  categoryName: string;
  month: number;
  year: number;
  spent: Prisma.Decimal;
  budget: Prisma.Decimal;
  currency: string;
}): string {
  const formattedSpent = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: params.currency
  }).format(formatMoney(params.spent) as any);

  const formattedBudget = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: params.currency
  }).format(formatMoney(params.budget) as any);

  const monthStr = monthLabel(params.year, params.month);
  let message = `You have used ${params.threshold}% of your ${params.categoryName} budget for ${monthStr} (${formattedSpent} of ${formattedBudget})`;

  if (message.length > LIMITS.ALERT.MESSAGE_MAX) {
    message = message.slice(0, LIMITS.ALERT.MESSAGE_MAX);
  }

  return message;
}

/**
 * Core alert evaluation engine:
 * 1. Locks budget rows in deterministic order with FOR UPDATE.
 * 2. Computes actual monthly spend for each locked budget.
 * 3. Identifies breached thresholds.
 * 4. Inserts new alert records (alerts are immutable historical records; never retracted).
 */
async function evaluateLockedBudgets(
  tx: Prisma.TransactionClient,
  userId: string,
  budgets: Array<{
    id: string;
    categoryId: string;
    month: number;
    year: number;
    amount: Prisma.Decimal;
    category: { name: string };
  }>,
  prefs: AlertPrefs
): Promise<AlertDto[]> {
  if (budgets.length === 0 || !prefs.inAppEnabled || prefs.thresholds.length === 0) {
    return [];
  }

  // a. Lock budget rows in deterministic order (sorted by ID) to prevent concurrency races and deadlocks
  const sortedIds = Array.from(new Set(budgets.map((b) => b.id))).sort();
  for (const bId of sortedIds) {
    await tx.$queryRaw`SELECT id FROM "Budget" WHERE id = ${bId} AND "userId" = ${userId} FOR UPDATE`;
  }

  // b. Group budgets by (year, month) to calculate spend in bulk
  const monthGroups = new Map<string, { year: number; month: number; categoryIds: string[] }>();
  for (const b of budgets) {
    const key = `${b.year}-${b.month}`;
    if (!monthGroups.has(key)) {
      monthGroups.set(key, { year: b.year, month: b.month, categoryIds: [] });
    }
    monthGroups.get(key)!.categoryIds.push(b.categoryId);
  }

  const spentMap = new Map<string, Prisma.Decimal>();
  for (const group of monthGroups.values()) {
    const { start, endExclusive } = monthRange(group.year, group.month);
    const sums = await tx.transaction.groupBy({
      by: ['categoryId'],
      _sum: { amount: true },
      where: {
        userId,
        type: 'EXPENSE',
        categoryId: { in: group.categoryIds },
        date: { gte: start, lt: endExclusive }
      }
    });

    for (const s of sums) {
      const key = `${s.categoryId}:${group.year}:${group.month}`;
      spentMap.set(key, s._sum.amount ?? new Prisma.Decimal(0));
    }
  }

  // c. Collect candidate alerts for all crossed thresholds
  interface CandidateAlert {
    budgetId: string;
    categoryId: string;
    categoryName: string;
    threshold: number;
    month: number;
    year: number;
    message: string;
  }

  const candidates: CandidateAlert[] = [];
  for (const b of budgets) {
    const key = `${b.categoryId}:${b.year}:${b.month}`;
    const spent = spentMap.get(key) ?? new Prisma.Decimal(0);

    for (const threshold of prefs.thresholds) {
      if (reachedThreshold(spent, b.amount, threshold)) {
        candidates.push({
          budgetId: b.id,
          categoryId: b.categoryId,
          categoryName: b.category.name,
          threshold,
          month: b.month,
          year: b.year,
          message: buildAlertMessage({
            threshold,
            categoryName: b.category.name,
            month: b.month,
            year: b.year,
            spent,
            budget: b.amount,
            currency: prefs.currency
          })
        });
      }
    }
  }

  if (candidates.length === 0) {
    return [];
  }

  // d. Filter out already-fired alerts within the same locked section
  const existingAlerts = await tx.alert.findMany({
    where: {
      budgetId: { in: sortedIds }
    },
    select: {
      budgetId: true,
      threshold: true
    }
  });

  const existingSet = new Set(existingAlerts.map((a) => `${a.budgetId}:${a.threshold}`));
  const newCandidates = candidates.filter((c) => !existingSet.has(`${c.budgetId}:${c.threshold}`));

  if (newCandidates.length === 0) {
    return [];
  }

  // Insert candidate alerts
  await tx.alert.createMany({
    data: newCandidates.map((c) => ({
      userId,
      budgetId: c.budgetId,
      threshold: c.threshold,
      month: c.month,
      year: c.year,
      message: c.message,
      isRead: false
    })),
    skipDuplicates: true
  });

  // e. Fetch newly created alert records with category metadata
  const createdRows = await tx.alert.findMany({
    where: {
      budgetId: { in: sortedIds },
      threshold: { in: newCandidates.map((c) => c.threshold) }
    },
    include: {
      budget: {
        include: {
          category: {
            select: { name: true }
          }
        }
      }
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
  });

  // Keep only the rows corresponding to new candidates
  const candidateKeys = new Set(newCandidates.map((c) => `${c.budgetId}:${c.threshold}`));
  const newlyCreated = createdRows.filter((r) => candidateKeys.has(`${r.budgetId}:${r.threshold}`));

  return newlyCreated.map((r) => ({
    id: r.id,
    budgetId: r.budgetId,
    categoryId: r.budget.categoryId,
    categoryName: r.budget.category.name,
    threshold: r.threshold,
    month: r.month,
    year: r.year,
    message: r.message,
    isRead: r.isRead,
    createdAt: r.createdAt
  }));
}

/**
 * Evaluates budget alerts triggered by a list of spending targets { categoryId, date }.
 */
export async function evaluateBudgetsForSpend(
  tx: Prisma.TransactionClient,
  userId: string,
  targets: Array<{ categoryId: string; date: Date }>
): Promise<AlertDto[]> {
  if (targets.length === 0) return [];

  // Derive (categoryId, year, month) from UTC date components
  const uniqueTargetsMap = new Map<string, { categoryId: string; month: number; year: number }>();
  for (const t of targets) {
    const year = t.date.getUTCFullYear();
    const month = t.date.getUTCMonth() + 1;
    const key = `${t.categoryId}:${year}:${month}`;
    if (!uniqueTargetsMap.has(key)) {
      uniqueTargetsMap.set(key, { categoryId: t.categoryId, month, year });
    }
  }

  const distinctTargets = Array.from(uniqueTargetsMap.values());
  if (distinctTargets.length === 0) return [];

  const prefs = await loadAlertPrefs(tx, userId);
  if (!prefs.inAppEnabled) return [];

  const budgets = await tx.budget.findMany({
    where: {
      userId,
      OR: distinctTargets.map((d) => ({
        categoryId: d.categoryId,
        month: d.month,
        year: d.year
      }))
    },
    include: {
      category: { select: { name: true } }
    }
  });

  if (budgets.length === 0) return [];
  return evaluateLockedBudgets(tx, userId, budgets, prefs);
}

/**
 * Evaluates alerts for specific budget IDs (used after budget upsert or copy).
 */
export async function evaluateBudgetIds(
  tx: Prisma.TransactionClient,
  userId: string,
  budgetIds: string[]
): Promise<AlertDto[]> {
  if (budgetIds.length === 0) return [];

  const prefs = await loadAlertPrefs(tx, userId);
  if (!prefs.inAppEnabled) return [];

  const budgets = await tx.budget.findMany({
    where: {
      id: { in: budgetIds },
      userId
    },
    include: {
      category: { select: { name: true } }
    }
  });

  if (budgets.length === 0) return [];
  return evaluateLockedBudgets(tx, userId, budgets, prefs);
}

export class AlertService {
  static async list(
    userId: string,
    query: ListAlertsQuery
  ): Promise<{
    items: AlertDto[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      unreadCount: number;
    };
  }> {
    const where: Prisma.AlertWhereInput = {
      userId,
      ...(query.unread !== undefined ? { isRead: !query.unread } : {})
    };

    const [alerts, total, unreadCount] = await Promise.all([
      prisma.alert.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          budget: {
            include: {
              category: { select: { name: true } }
            }
          }
        }
      }),
      prisma.alert.count({ where }),
      prisma.alert.count({ where: { userId, isRead: false } })
    ]);

    const totalPages = Math.ceil(total / query.limit) || 1;

    const items: AlertDto[] = alerts.map((a) => ({
      id: a.id,
      budgetId: a.budgetId,
      categoryId: a.budget.categoryId,
      categoryName: a.budget.category.name,
      threshold: a.threshold,
      month: a.month,
      year: a.year,
      message: a.message,
      isRead: a.isRead,
      createdAt: a.createdAt
    }));

    return {
      items,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
        unreadCount
      }
    };
  }

  static async unreadCount(userId: string): Promise<{ unreadCount: number }> {
    const count = await prisma.alert.count({
      where: { userId, isRead: false }
    });
    return { unreadCount: count };
  }

  static async markRead(userId: string, id: string): Promise<AlertDto> {
    const alert = await prisma.alert.findFirst({
      where: { id, userId },
      include: {
        budget: {
          include: {
            category: { select: { name: true } }
          }
        }
      }
    });

    if (!alert) {
      throw ApiError.notFound(ERROR_CODES.ALERT_NOT_FOUND, 'Alert not found');
    }

    if (!alert.isRead) {
      await prisma.alert.updateMany({
        where: { id, userId },
        data: { isRead: true }
      });
      alert.isRead = true;
    }

    return {
      id: alert.id,
      budgetId: alert.budgetId,
      categoryId: alert.budget.categoryId,
      categoryName: alert.budget.category.name,
      threshold: alert.threshold,
      month: alert.month,
      year: alert.year,
      message: alert.message,
      isRead: true,
      createdAt: alert.createdAt
    };
  }

  static async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await prisma.alert.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true }
    });
    return { updated: result.count };
  }
}
