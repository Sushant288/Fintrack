import { Prisma } from '@prisma/client';
import { LIMITS } from '../config/limits';
import { prisma } from '../config/prisma';
import {
  CopyBudgetInput,
  UpsertBudgetInput,
  UpsertOverallBudgetInput
} from '../validators/budget.schema';
import { ApiError, ERROR_CODES } from '../utils/ApiError';
import { monthRange, previousMonth, todayInTimeZone } from '../utils/dates';
import { formatMoney, parseMoney, percentOf, reachedThreshold, sumMoney } from '../utils/money';
import { AlertDto, evaluateBudgetIds, loadAlertPrefs } from './alert.service';
import { assertCategoryUsable } from './category.service';

export interface BudgetItem {
  id: string;
  categoryId: string;
  category: {
    id: string;
    name: string;
    color: string;
    icon: string;
  };
  month: number;
  year: number;
  amount: string;
  spent: string;
  remaining: string;
  percentUsed: number;
  status: 'ok' | 'warning' | 'exceeded';
  alertsFired: number[];
}

export interface OverallItem {
  id: string;
  month: number;
  year: number;
  amount: string;
  spent: string;
  remaining: string;
  percentUsed: number;
  status: 'ok' | 'warning' | 'exceeded';
}

export class BudgetService {
  static async view(
    userId: string,
    month?: number,
    year?: number
  ): Promise<{
    month: number;
    year: number;
    items: BudgetItem[];
    overall: OverallItem | null;
    meta: {
      totalBudgeted: string;
      totalSpent: string;
      unbudgetedSpent: string;
      thresholds: number[];
    };
  }> {
    const prefs = await loadAlertPrefs(prisma, userId);

    let targetMonth = month;
    let targetYear = year;

    if (targetMonth === undefined || targetYear === undefined) {
      const todayYmd = todayInTimeZone(prefs.timezone);
      const [y, m] = todayYmd.split('-').map(Number);
      targetYear = y;
      targetMonth = m;
    }

    const { start, endExclusive } = monthRange(targetYear, targetMonth);
    const lowestThreshold = prefs.thresholds.length > 0 ? prefs.thresholds[0] : 100;

    const [budgets, categorySums, overall, alerts, totalExpenseAgg] = await Promise.all([
      prisma.budget.findMany({
        where: { userId, month: targetMonth, year: targetYear },
        include: {
          category: {
            select: { id: true, name: true, color: true, icon: true }
          }
        }
      }),
      prisma.transaction.groupBy({
        by: ['categoryId'],
        _sum: { amount: true },
        where: {
          userId,
          type: 'EXPENSE',
          date: { gte: start, lt: endExclusive }
        }
      }),
      prisma.overallBudget.findUnique({
        where: {
          userId_month_year: {
            userId,
            month: targetMonth,
            year: targetYear
          }
        }
      }),
      prisma.alert.findMany({
        where: { userId, month: targetMonth, year: targetYear },
        select: { budgetId: true, threshold: true }
      }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: {
          userId,
          type: 'EXPENSE',
          date: { gte: start, lt: endExclusive }
        }
      })
    ]);

    const spentMap = new Map<string, Prisma.Decimal>();
    for (const g of categorySums) {
      spentMap.set(g.categoryId, g._sum.amount ?? new Prisma.Decimal(0));
    }

    const alertsFiredMap = new Map<string, number[]>();
    for (const a of alerts) {
      if (!alertsFiredMap.has(a.budgetId)) {
        alertsFiredMap.set(a.budgetId, []);
      }
      alertsFiredMap.get(a.budgetId)!.push(a.threshold);
    }
    for (const arr of alertsFiredMap.values()) {
      arr.sort((x, y) => x - y);
    }

    const items: BudgetItem[] = budgets.map((b) => {
      const spent = spentMap.get(b.categoryId) ?? new Prisma.Decimal(0);
      const remaining = b.amount.sub(spent);
      const percentUsed = percentOf(spent, b.amount).toNumber();

      let status: 'ok' | 'warning' | 'exceeded' = 'ok';
      if (spent.gt(b.amount)) {
        status = 'exceeded';
      } else if (reachedThreshold(spent, b.amount, lowestThreshold)) {
        status = 'warning';
      }

      return {
        id: b.id,
        categoryId: b.categoryId,
        category: {
          id: b.category.id,
          name: b.category.name,
          color: b.category.color,
          icon: b.category.icon
        },
        month: b.month,
        year: b.year,
        amount: formatMoney(b.amount),
        spent: formatMoney(spent),
        remaining: formatMoney(remaining),
        percentUsed,
        status,
        alertsFired: alertsFiredMap.get(b.id) ?? []
      };
    });

    // Sort items by percentUsed desc, then category name asc
    items.sort((a, b) => {
      if (b.percentUsed !== a.percentUsed) {
        return b.percentUsed - a.percentUsed;
      }
      return a.category.name.localeCompare(b.category.name);
    });

    const totalSpentDec = totalExpenseAgg._sum.amount ?? new Prisma.Decimal(0);
    const totalBudgetedDec = sumMoney(budgets.map((b) => b.amount));

    let overallItem: OverallItem | null = null;
    if (overall) {
      const remaining = overall.amount.sub(totalSpentDec);
      const percentUsed = percentOf(totalSpentDec, overall.amount).toNumber();

      let status: 'ok' | 'warning' | 'exceeded' = 'ok';
      if (totalSpentDec.gt(overall.amount)) {
        status = 'exceeded';
      } else if (reachedThreshold(totalSpentDec, overall.amount, lowestThreshold)) {
        status = 'warning';
      }

      overallItem = {
        id: overall.id,
        month: overall.month,
        year: overall.year,
        amount: formatMoney(overall.amount),
        spent: formatMoney(totalSpentDec),
        remaining: formatMoney(remaining),
        percentUsed,
        status
      };
    }

    let budgetedSpentDec = new Prisma.Decimal(0);
    for (const b of budgets) {
      budgetedSpentDec = budgetedSpentDec.add(spentMap.get(b.categoryId) ?? new Prisma.Decimal(0));
    }
    const unbudgetedSpentDec = totalSpentDec.sub(budgetedSpentDec);

    return {
      month: targetMonth,
      year: targetYear,
      items,
      overall: overallItem,
      meta: {
        totalBudgeted: formatMoney(totalBudgetedDec),
        totalSpent: formatMoney(totalSpentDec),
        unbudgetedSpent: formatMoney(unbudgetedSpentDec),
        thresholds: prefs.thresholds
      }
    };
  }

  static async upsertBudget(
    userId: string,
    input: UpsertBudgetInput
  ): Promise<{ item: BudgetItem; created: boolean; alerts: AlertDto[] }> {
    return prisma.$transaction(
      async (tx) => {
        // 1. Assert category is usable and EXPENSE
        await assertCategoryUsable(tx, userId, input.categoryId, 'EXPENSE');

        // 2. Check if budget already exists
        const existing = await tx.budget.findUnique({
          where: {
            userId_categoryId_month_year: {
              userId,
              categoryId: input.categoryId,
              month: input.month,
              year: input.year
            }
          }
        });

        let budgetId: string;
        let created = false;

        if (existing) {
          await tx.budget.update({
            where: { id: existing.id },
            data: { amount: parseMoney(input.amount) }
          });
          budgetId = existing.id;
          created = false;
        } else {
          try {
            const createdRow = await tx.budget.create({
              data: {
                userId,
                categoryId: input.categoryId,
                type: 'EXPENSE',
                month: input.month,
                year: input.year,
                amount: parseMoney(input.amount)
              }
            });
            budgetId = createdRow.id;
            created = true;
          } catch (err: any) {
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
              const raced = await tx.budget.findUnique({
                where: {
                  userId_categoryId_month_year: {
                    userId,
                    categoryId: input.categoryId,
                    month: input.month,
                    year: input.year
                  }
                }
              });
              await tx.budget.update({
                where: { id: raced!.id },
                data: { amount: parseMoney(input.amount) }
              });
              budgetId = raced!.id;
              created = false;
            } else {
              throw err;
            }
          }
        }

        // 3. Evaluate alerts (lowering amount may fire alerts immediately)
        const alerts = await evaluateBudgetIds(tx, userId, [budgetId]);

        // 4. Return BudgetItem representation
        const budget = await tx.budget.findUnique({
          where: { id: budgetId },
          include: {
            category: { select: { id: true, name: true, color: true, icon: true } }
          }
        });

        const { start, endExclusive } = monthRange(input.year, input.month);
        const spendAgg = await tx.transaction.aggregate({
          _sum: { amount: true },
          where: {
            userId,
            categoryId: input.categoryId,
            type: 'EXPENSE',
            date: { gte: start, lt: endExclusive }
          }
        });

        const firedAlerts = await tx.alert.findMany({
          where: { budgetId },
          select: { threshold: true },
          orderBy: { threshold: 'asc' }
        });

        const prefs = await loadAlertPrefs(tx, userId);
        const lowestThreshold = prefs.thresholds.length > 0 ? prefs.thresholds[0] : 100;
        const spent = spendAgg._sum.amount ?? new Prisma.Decimal(0);
        const remaining = budget!.amount.sub(spent);
        const percentUsed = percentOf(spent, budget!.amount).toNumber();

        let status: 'ok' | 'warning' | 'exceeded' = 'ok';
        if (spent.gt(budget!.amount)) {
          status = 'exceeded';
        } else if (reachedThreshold(spent, budget!.amount, lowestThreshold)) {
          status = 'warning';
        }

        const item: BudgetItem = {
          id: budget!.id,
          categoryId: budget!.categoryId,
          category: budget!.category,
          month: budget!.month,
          year: budget!.year,
          amount: formatMoney(budget!.amount),
          spent: formatMoney(spent),
          remaining: formatMoney(remaining),
          percentUsed,
          status,
          alertsFired: firedAlerts.map((a) => a.threshold)
        };

        return { item, created, alerts };
      },
      {
        timeout: LIMITS.DB.TRANSACTION_TIMEOUT_MS,
        maxWait: LIMITS.DB.TRANSACTION_MAX_WAIT_MS
      }
    );
  }

  static async deleteBudget(userId: string, id: string): Promise<{ deleted: true }> {
    const res = await prisma.budget.deleteMany({
      where: { id, userId }
    });

    if (res.count === 0) {
      throw ApiError.notFound(ERROR_CODES.BUDGET_NOT_FOUND, 'Budget not found');
    }

    return { deleted: true };
  }

  static async upsertOverall(userId: string, input: UpsertOverallBudgetInput): Promise<OverallItem> {
    const parsedAmount = parseMoney(input.amount);

    const overall = await prisma.overallBudget.upsert({
      where: {
        userId_month_year: {
          userId,
          month: input.month,
          year: input.year
        }
      },
      create: {
        userId,
        month: input.month,
        year: input.year,
        amount: parsedAmount
      },
      update: {
        amount: parsedAmount
      }
    });

    const { start, endExclusive } = monthRange(input.year, input.month);
    const agg = await prisma.transaction.aggregate({
      _sum: { amount: true },
      where: {
        userId,
        type: 'EXPENSE',
        date: { gte: start, lt: endExclusive }
      }
    });

    const prefs = await loadAlertPrefs(prisma, userId);
    const lowestThreshold = prefs.thresholds.length > 0 ? prefs.thresholds[0] : 100;
    const spent = agg._sum.amount ?? new Prisma.Decimal(0);
    const remaining = overall.amount.sub(spent);
    const percentUsed = percentOf(spent, overall.amount).toNumber();

    let status: 'ok' | 'warning' | 'exceeded' = 'ok';
    if (spent.gt(overall.amount)) {
      status = 'exceeded';
    } else if (reachedThreshold(spent, overall.amount, lowestThreshold)) {
      status = 'warning';
    }

    return {
      id: overall.id,
      month: overall.month,
      year: overall.year,
      amount: formatMoney(overall.amount),
      spent: formatMoney(spent),
      remaining: formatMoney(remaining),
      percentUsed,
      status
    };
  }

  static async deleteOverall(
    userId: string,
    month: number,
    year: number
  ): Promise<{ deleted: true }> {
    const res = await prisma.overallBudget.deleteMany({
      where: { userId, month, year }
    });

    if (res.count === 0) {
      throw ApiError.notFound(ERROR_CODES.BUDGET_NOT_FOUND, 'Overall budget not found');
    }

    return { deleted: true };
  }

  static async copy(
    userId: string,
    input: CopyBudgetInput
  ): Promise<{
    data: {
      copied: number;
      skipped: number;
      skippedArchived: number;
      overwritten: number;
      overallCopied: boolean;
      fromMonth: number;
      fromYear: number;
      toMonth: number;
      toYear: number;
    };
    alerts: AlertDto[];
  }> {
    const target = { month: input.toMonth, year: input.toYear };
    const source =
      input.fromMonth && input.fromYear
        ? { month: input.fromMonth, year: input.fromYear }
        : previousMonth(target.year, target.month);

    if (source.month === target.month && source.year === target.year) {
      throw ApiError.badRequest(
        ERROR_CODES.INVALID_BUDGET_COPY,
        'Source and destination budget periods cannot be identical'
      );
    }

    return prisma.$transaction(
      async (tx) => {
        // 1. Load source budgets and target budgets
        const [sourceBudgets, targetBudgets, sourceOverall, targetOverall] = await Promise.all([
          tx.budget.findMany({
            where: { userId, month: source.month, year: source.year },
            include: { category: true }
          }),
          tx.budget.findMany({
            where: { userId, month: target.month, year: target.year }
          }),
          tx.overallBudget.findUnique({
            where: {
              userId_month_year: {
                userId,
                month: source.month,
                year: source.year
              }
            }
          }),
          tx.overallBudget.findUnique({
            where: {
              userId_month_year: {
                userId,
                month: target.month,
                year: target.year
              }
            }
          })
        ]);

        const targetMap = new Map(targetBudgets.map((b) => [b.categoryId, b]));
        const affectedBudgetIds: string[] = [];

        let copied = 0;
        let skipped = 0;
        let skippedArchived = 0;
        let overwritten = 0;

        const toCreate: Array<{
          userId: string;
          categoryId: string;
          type: 'EXPENSE';
          month: number;
          year: number;
          amount: Prisma.Decimal;
        }> = [];

        for (const sb of sourceBudgets) {
          if (sb.category.isArchived) {
            skippedArchived++;
            continue;
          }

          const existingTarget = targetMap.get(sb.categoryId);
          if (existingTarget) {
            if (input.overwrite) {
              await tx.budget.update({
                where: { id: existingTarget.id },
                data: { amount: sb.amount }
              });
              overwritten++;
              affectedBudgetIds.push(existingTarget.id);
            } else {
              skipped++;
            }
          } else {
            toCreate.push({
              userId,
              categoryId: sb.categoryId,
              type: 'EXPENSE',
              month: target.month,
              year: target.year,
              amount: sb.amount
            });
            copied++;
          }
        }

        if (toCreate.length > 0) {
          await tx.budget.createMany({
            data: toCreate,
            skipDuplicates: true
          });

          const createdRows = await tx.budget.findMany({
            where: {
              userId,
              month: target.month,
              year: target.year,
              categoryId: { in: toCreate.map((c) => c.categoryId) }
            },
            select: { id: true }
          });
          affectedBudgetIds.push(...createdRows.map((r) => r.id));
        }

        // Handle overall budget copy
        let overallCopied = false;
        if (sourceOverall) {
          if (targetOverall) {
            if (input.overwrite) {
              await tx.overallBudget.update({
                where: { id: targetOverall.id },
                data: { amount: sourceOverall.amount }
              });
              overallCopied = true;
            }
          } else {
            await tx.overallBudget.create({
              data: {
                userId,
                month: target.month,
                year: target.year,
                amount: sourceOverall.amount
              }
            });
            overallCopied = true;
          }
        }

        // 4. Evaluate alerts for newly created or overwritten budgets
        const alerts = await evaluateBudgetIds(tx, userId, affectedBudgetIds);

        return {
          data: {
            copied,
            skipped,
            skippedArchived,
            overwritten,
            overallCopied,
            fromMonth: source.month,
            fromYear: source.year,
            toMonth: target.month,
            toYear: target.year
          },
          alerts
        };
      },
      {
        timeout: LIMITS.DB.TRANSACTION_TIMEOUT_MS,
        maxWait: LIMITS.DB.TRANSACTION_MAX_WAIT_MS
      }
    );
  }
}
